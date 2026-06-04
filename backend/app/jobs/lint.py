"""Lint — 온톨로지 위생 점검 (Karpathy 3 ops 중 Lint).

night_batch 매 실행 + on-demand(API). 탐지:
- stale: 90일+ 오래된 unverified 노드 → confidence_status=stale 자동 태깅 (verified/contradicted 는 건드리지 않음)
- orphan: wiki_body 있는데 [[wikilink]] 가 하나도 없는 고립 노드 (보고)
- dangling_wikilinks: [[term]] 이 등록된 brand/카테고리 어디에도 안 걸림 (보고)
- contradiction: 같은 brand 인데 family/base_model 값이 충돌 (보고)
- duplicates: 같은 url 을 가진 서로 다른 item (보고)

stale 만 자동 조치(보수적: unverified→stale). 나머지는 보고만(사람 검토).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.database import SessionLocal
from app.jobs.arca_brain import normalize_brand
from app.jobs.family_grouper import _brand_of
from app.jobs.wiki_linker import _extract_wikilinks
from app.models import Category, ConfidenceStatus, Item

logger = logging.getLogger(__name__)

STALE_DAYS = 90


async def run_lint(auto_tag_stale: bool = True) -> dict:
    """온톨로지 위생 점검. auto_tag_stale=True 면 90일+ unverified → stale 자동 태깅."""
    async with SessionLocal() as db:
        items = list((await db.execute(select(Item))).scalars().all())
        cats = list((await db.execute(select(Category))).scalars().all())

        # 알려진 link 대상 이름 집합 (brand ∪ category slug/name) — dangling 판정용
        known: set[str] = set()
        for it in items:
            b = _brand_of(it)
            if b:
                known.add(b)
        for c in cats:
            for nm in (c.slug, c.name_ko, c.name_en):
                nb = normalize_brand(nm) if nm else None
                if nb:
                    known.add(nb)

        cutoff = datetime.now(timezone.utc) - timedelta(days=STALE_DAYS)

        stale_ids: list[int] = []
        orphan_ids: list[int] = []
        dangling: list[dict] = []
        brand_fields: dict[str, dict[str, set]] = {}
        url_map: dict[str, list[int]] = {}
        auto_tagged = 0

        for it in items:
            # --- stale (Item 에 updated_at 없음 → discovered_at 기준) ---
            disc = it.discovered_at
            if disc is not None and disc.tzinfo is None:
                disc = disc.replace(tzinfo=timezone.utc)
            lifecycle = getattr(it.lifecycle_status, "value", it.lifecycle_status)
            if disc and disc < cutoff and lifecycle != "deprecated":
                stale_ids.append(it.id)
                if auto_tag_stale and it.confidence_status == ConfidenceStatus.unverified:
                    it.confidence_status = ConfidenceStatus.stale
                    auto_tagged += 1

            # --- orphan (wiki 있는데 링크 0) ---
            wb = (it.wiki_body or "").strip()
            if wb and "[[" not in wb:
                orphan_ids.append(it.id)

            # --- dangling wikilinks (등록 brand/카테고리 미매칭) ---
            bad = [t for t in _extract_wikilinks(it) if t not in known]
            if bad:
                dangling.append({"item_id": it.id, "terms": bad[:5]})

            # --- contradiction prep (같은 brand → family/base_model 충돌) ---
            md = it.item_metadata or {}
            arca = md.get("arca") if isinstance(md, dict) else None
            b = _brand_of(it)
            if b and isinstance(arca, dict):
                for field in ("family", "base_model"):
                    v = normalize_brand(arca.get(field))
                    if v and v != b:
                        brand_fields.setdefault(b, {}).setdefault(field, set()).add(v)

            # --- duplicates by url ---
            if it.url:
                url_map.setdefault(it.url.strip(), []).append(it.id)

        contradictions = [
            {"brand": b, "field": field, "values": sorted(vals)}
            for b, fields in brand_fields.items()
            for field, vals in fields.items()
            if len(vals) > 1
        ]
        dup_groups = [{"url": u, "item_ids": ids} for u, ids in url_map.items() if len(ids) > 1]

        if auto_tagged:
            await db.commit()

    report = {
        "total_items": len(items),
        "stale": {"count": len(stale_ids), "auto_tagged": auto_tagged, "item_ids": stale_ids[:200]},
        "orphan": {"count": len(orphan_ids), "item_ids": orphan_ids[:200]},
        "dangling_wikilinks": {"count": len(dangling), "samples": dangling[:50]},
        "contradictions": {"count": len(contradictions), "groups": contradictions[:50]},
        "duplicates": {"count": len(dup_groups), "groups": dup_groups[:50]},
    }
    logger.info(
        f"[lint] stale={len(stale_ids)}(tagged {auto_tagged}) orphan={len(orphan_ids)} "
        f"dangling={len(dangling)} contradiction={len(contradictions)} dup={len(dup_groups)}"
    )
    return report
