"""Deep Research 통합 (LDR → Arca → DB) 의 '우리 쪽' 글루.

분담: LDR(별도 설치, agentic 탐색) 이 리서치 → 여기서 그 결과의 **소스 URL**을 뽑아
Item 으로 적재(llm_score=0) → 기존 Arca(night_batch step_score_items) 가 정리.

이 모듈은 **LDR 을 import 하지 않는다** (LDR 호출은 standalone run_deep_research.py 가 담당).
따라서 앱이 안전하게 import 가능 + 단위 테스트 가능. LDR 출력 구조가 미문서화라
URL 정규식으로 방어적 추출(arxiv/github/hf) + 중복은 on_conflict_do_nothing.
"""
from __future__ import annotations

import logging
import re

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import SessionLocal
from app.models import Item

logger = logging.getLogger(__name__)

_URL_RE = re.compile(r"https?://[^\s)\]\"'>}]+")
_ARXIV_RE = re.compile(r"arxiv\.org/(?:abs|pdf)/(\d{4}\.\d{4,5})(?:v\d+)?", re.I)
_GITHUB_RE = re.compile(r"github\.com/([\w.\-]+/[\w.\-]+)", re.I)
_HF_RE = re.compile(r"huggingface\.co/([\w.\-]+/[\w.\-]+)", re.I)

# github.com 의 repo 아닌 경로 (소유자 위치) 제외
_GH_NOISE = {
    "features", "topics", "about", "pricing", "marketplace", "sponsors", "settings",
    "login", "join", "search", "explore", "notifications", "orgs", "apps", "collections",
}
# huggingface.co 의 model 아닌 네임스페이스 제외
_HF_NOISE = {"datasets", "spaces", "docs", "blog", "models", "organizations", "settings"}


def _url_to_identity(url: str) -> tuple[str, str] | None:
    """URL → (source, external_id). 모델/논문/레포로 매핑 가능한 것만, 아니면 None."""
    m = _ARXIV_RE.search(url)
    if m:
        return ("arxiv", m.group(1))
    m = _GITHUB_RE.search(url)
    if m:
        repo = m.group(1).rstrip("/.")
        owner = repo.split("/")[0].lower()
        leaf = repo.split("/")[1].lower() if "/" in repo else ""
        if owner in _GH_NOISE or leaf.endswith((".git",)):
            return None
        return ("github", repo)
    m = _HF_RE.search(url)
    if m:
        path = m.group(1).rstrip("/.")
        if path.split("/")[0].lower() in _HF_NOISE:
            return None
        return ("hf", path)
    return None


def _gather_strings(obj) -> list[str]:
    """dict/list/str 재귀 순회하며 모든 문자열 수집 (LDR 출력 구조 미상 대비)."""
    out: list[str] = []
    if isinstance(obj, str):
        out.append(obj)
    elif isinstance(obj, dict):
        for v in obj.values():
            out.extend(_gather_strings(v))
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            out.extend(_gather_strings(v))
    return out


def extract_findings_from_ldr(result, query: str = "") -> list[dict]:
    """LDR 결과(dict/str) 에서 arxiv/github/hf 소스를 뽑아 정규화 findings 리스트로.

    구조 미상이므로: (1) 전체 문자열 재귀 수집 → URL 정규식 → identity 매핑.
    summary 는 각 finding 의 abstract 컨텍스트로(Arca 가 점수 매길 근거).
    """
    if isinstance(result, dict):
        summary = str(result.get("summary") or result.get("report") or result.get("findings") or "")
        blobs = _gather_strings(result)
    else:
        summary = str(result or "")
        blobs = [summary]

    urls: list[str] = []
    for b in blobs:
        urls.extend(_URL_RE.findall(b))

    seen: dict[str, dict] = {}
    for u in urls:
        ident = _url_to_identity(u)
        if not ident:
            continue
        key = f"{ident[0]}:{ident[1]}"
        if key in seen:
            continue
        seen[key] = {
            "source": ident[0],
            "external_id": ident[1],
            "url": u,
            "title": ident[1],  # best-effort (bare id) — 후속 enrich 대상
            "abstract": (summary[:1500] or None),
            "query": query,
        }
    logger.info(f"[deep_research] extracted {len(seen)} findings from {len(urls)} urls")
    return list(seen.values())


async def ingest_findings(findings: list[dict]) -> dict:
    """findings → Item upsert (llm_score=0 → Arca 가 다음에 정리).

    on_conflict_do_nothing: 이미 가진 item(풍부한 데이터)을 LDR 의 빈약한 데이터로 덮지 않음.
    """
    new = 0
    async with SessionLocal() as db:
        for f in findings:
            md = {"discovered_via": "ldr", "ldr_query": f.get("query", "")}
            stmt = (
                pg_insert(Item)
                .values(
                    source=f["source"],
                    external_id=f["external_id"],
                    url=f.get("url"),
                    title=(f.get("title") or f["external_id"])[:2000],
                    abstract=f.get("abstract"),
                    item_metadata=md,
                    keyword_score=0,
                    llm_score=0,
                    priority="WATCH",
                    status="new",
                )
                .on_conflict_do_nothing(index_elements=["source", "external_id"])
            )
            res = await db.execute(stmt)
            if res.rowcount:
                new += 1
        await db.commit()
    logger.info(f"[deep_research] ingested new={new}/{len(findings)}")
    return {"ingested_new": new, "candidates": len(findings)}
