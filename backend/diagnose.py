"""diagnose.py — #6(Gemma 파싱 실패) / #7(크롤러 소스 편중) 검증 도구.

5090 에서 한 줄 돌리고 출력을 복붙하면 진단 가능.

사용법 (backend/ 에서 venv 활성화 후):
  python diagnose.py              # DB 현재 상태 스냅샷 (안전·빠름, 크롤/LLM 안 함)
  python diagnose.py --crawl      # 크롤 1회 실제 실행 + 소스별 결과 (#7 직접 검증)
  python diagnose.py --score      # 미스코어 항목 Gemma 스코어링 1회 + usage 로그 (#6, Ollama 필요)
  python diagnose.py --crawl --score   # 둘 다

--crawl / --score 는 내부 진단 로그(`[arxiv] No cs.*`, `Gemma usage:` 등)도 같이 출력됨.
"""
from __future__ import annotations

import argparse
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, text

from app.database import SessionLocal
from app.models import CrawlRun, FeedItem, Item, LineageEdge


def _section(title: str) -> None:
    print("\n" + "=" * 64)
    print(title)
    print("=" * 64)


async def snapshot() -> None:
    now = datetime.now(timezone.utc)
    d1 = now - timedelta(hours=24)
    d7 = now - timedelta(days=7)

    async with SessionLocal() as db:
        # ── #7: 소스별 item 수 ──────────────────────────────
        _section("1. 소스별 ITEM 수  (#7 — huggingface 외 0/소수면 크롤 편중)")
        rows = (await db.execute(
            select(Item.source, func.count(Item.id)).group_by(Item.source).order_by(func.count(Item.id).desc())
        )).all()
        total = sum(c for _, c in rows)
        if not rows:
            print("  (item 없음)")
        for src, cnt in rows:
            new24 = (await db.execute(
                select(func.count(Item.id)).where(Item.source == src, Item.discovered_at >= d1)
            )).scalar() or 0
            new7 = (await db.execute(
                select(func.count(Item.id)).where(Item.source == src, Item.discovered_at >= d7)
            )).scalar() or 0
            print(f"  {src:14} total={cnt:>6}   최근7일={new7:>4}   최근24h={new24:>4}")
        print(f"  {'합계':14} total={total:>6}")

        # ── #7: 최근 크롤 실행 이력 ─────────────────────────
        _section("2. 최근 CRAWL 이력  (#7 — source별 found/new/error)")
        runs = (await db.execute(
            select(CrawlRun).order_by(CrawlRun.started_at.desc()).limit(24)
        )).scalars().all()
        if not runs:
            print("  (crawl_runs 기록 없음 — 아직 크롤 1회도 안 돎. --crawl 로 실행)")
        for r in runs:
            ts = r.started_at.strftime("%m-%d %H:%M") if r.started_at else "?"
            dur = ""
            if r.started_at and r.finished_at:
                dur = f" ({(r.finished_at - r.started_at).total_seconds():.0f}s)"
            err = f"  ERROR: {r.error[:80]}" if r.error else ""
            print(f"  {ts}{dur:7} {r.source:12} found={r.items_found:>4} new={r.items_new:>4}{err}")

        # ── #6: 스코어링 상태 ───────────────────────────────
        _section("3. 스코어링 상태  (#6 — unscored 많으면 Gemma 파싱 실패 의심)")
        scored = (await db.execute(select(func.count(Item.id)).where(Item.llm_score > 0))).scalar() or 0
        unscored = (await db.execute(select(func.count(Item.id)).where(Item.llm_score == 0))).scalar() or 0
        # llm_score=0 인데 llm_reason 이 있음 = 스코어링 시도했으나 0/부분실패
        tried_but_zero = (await db.execute(
            select(func.count(Item.id)).where(Item.llm_score == 0, Item.llm_reason.isnot(None), Item.llm_reason != "")
        )).scalar() or 0
        # arca 분석 metadata 있는 수 (정상 스코어링 흔적)
        has_arca = (await db.execute(
            text("SELECT count(*) FROM items WHERE item_metadata->'arca' IS NOT NULL")
        )).scalar() or 0
        print(f"  scored (llm_score>0)     : {scored}")
        print(f"  unscored (llm_score=0)   : {unscored}")
        print(f"    └ 그 중 llm_reason 있음 : {tried_but_zero}  (시도했으나 0점 — 파싱 부분실패 가능)")
        print(f"  arca 분석 metadata 보유  : {has_arca}")
        # priority 분포
        prows = (await db.execute(
            select(Item.priority, func.count(Item.id)).group_by(Item.priority).order_by(func.count(Item.id).desc())
        )).all()
        print("  priority 분포: " + ", ".join(f"{p or 'None'}={c}" for p, c in prows))

        # ── 이번 세션: brand / family ───────────────────────
        _section("4. BRAND / FAMILY  (Arca 모델 계열 추출 — 야간배치 후 채워짐)")
        brand_rows = (await db.execute(text(
            "SELECT item_metadata->'arca'->>'brand' AS brand, count(*) AS c "
            "FROM items WHERE item_metadata->'arca'->>'brand' IS NOT NULL "
            "GROUP BY brand ORDER BY c DESC LIMIT 20"
        ))).all()
        if not brand_rows:
            print("  (brand 태그 없음 — Arca 강화 후 야간배치를 아직 안 돌림)")
        for brand, c in brand_rows:
            print(f"  {brand:20} {c:>4}")
        fam = (await db.execute(
            select(func.count(LineageEdge.id)).where(LineageEdge.relationship_type == "same_family")
        )).scalar() or 0
        cites = (await db.execute(
            select(func.count(LineageEdge.id)).where(LineageEdge.relationship_type.in_(("cites", "cited_by")))
        )).scalar() or 0
        print(f"  same_family edges: {fam}   |   cites/cited_by edges: {cites}")

        # ── 피드 ────────────────────────────────────────────
        _section("5. FEED 아이템 (피드 크롤러)")
        frows = (await db.execute(
            select(FeedItem.source, func.count(FeedItem.id)).group_by(FeedItem.source).order_by(func.count(FeedItem.id).desc())
        )).all()
        if not frows:
            print("  (feed_items 없음)")
        for src, c in frows:
            print(f"  {src:14} {c:>5}")


async def run_crawl() -> None:
    _section("CRAWL 실행 (#7) — 소스별 fetched/new/error")
    from app.jobs.crawler import crawl_all
    results = await crawl_all()
    for r in results:
        src = r.get("source", "?")
        if "error" in r:
            print(f"  {src:12} ERROR: {r['error'][:120]}")
        else:
            print(f"  {src:12} fetched={r.get('fetched', '-'):>4} scored={r.get('scored', '-'):>4} new={r.get('new', '-'):>4}")
    print("\n→ huggingface 만 fetched>0 이고 나머지 0/에러면 #7 재현. 위 로그의 [arxiv]/[source] 진단 줄 확인.")


async def run_score() -> None:
    _section("SCORING 실행 (#6) — Gemma 스코어링 1회 (Ollama 필요)")
    from app.jobs.night_batch import step_score_items
    r = await step_score_items()
    print(f"  결과: {r}")
    print("\n→ scored < total 이면 #6 재현. 위 로그의 'Gemma usage:' (completion vs max_tokens),")
    print("  '[arca] truncation recovery', 'Scoring: failed to parse' 줄 확인.")


async def main() -> None:
    ap = argparse.ArgumentParser(description="#6/#7 진단 도구")
    ap.add_argument("--crawl", action="store_true", help="크롤 1회 실제 실행")
    ap.add_argument("--score", action="store_true", help="미스코어 항목 Gemma 스코어링 1회")
    args = ap.parse_args()

    if args.crawl or args.score:
        # 내부 진단 로그(arca/crawler)를 stdout 에 노출 → 복붙용
        logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    print(f"\n진단 시각: {datetime.now(timezone.utc).isoformat()}")
    await snapshot()
    if args.crawl:
        await run_crawl()
    if args.score:
        await run_score()
    if args.crawl or args.score:
        print("\n── 재집계 (실행 후 상태) ──")
        await snapshot()
    print("\n완료. 이 출력 전체를 복붙해서 공유하면 진단 가능.")


if __name__ == "__main__":
    asyncio.run(main())
