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
import xml.etree.ElementTree as ET

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import SessionLocal
from app.models import Item
from app.sources.base import get_with_retry

logger = logging.getLogger(__name__)

_URL_RE = re.compile(r"https?://[^\s)\]\"'>}]+")
_ARXIV_RE = re.compile(r"arxiv\.org/(?:abs|pdf)/(\d{4}\.\d{4,5})(?:v\d+)?", re.I)
_GITHUB_RE = re.compile(r"github\.com/([\w.\-]+/[\w.\-]+)", re.I)
_HF_RE = re.compile(r"huggingface\.co/([\w.\-]+/[\w.\-]+)", re.I)
# openalex/SearXNG 등 학술 엔진 결과 — arxiv/github/hf 가 아닌 논문 식별자.
_OPENALEX_RE = re.compile(r"openalex\.org/(W\d+)", re.I)
_DOI_RE = re.compile(r"(?:doi\.org/|\bdoi:\s*)(10\.\d{4,9}/[^\s\"'<>]+)", re.I)

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
    # arxiv/github/hf 가 아니면 DOI > openalex 순으로 논문 식별 (openalex 검색결과 대응).
    m = _DOI_RE.search(url)
    if m:
        return ("doi", m.group(1).rstrip("/.").lower())
    m = _OPENALEX_RE.search(url)
    if m:
        return ("openalex", m.group(1))
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
        summary = str(result.get("summary") or result.get("report") or "")
        blobs = _gather_strings(result)
    else:
        summary = str(result or "")
        blobs = [summary]

    seen: dict[str, dict] = {}
    claimed: set[str] = set()  # 같은 논문의 대체 식별자(openalex id ↔ doi 등) — 정규식 폴백 중복 방지.

    # (1순위) 정형 sources[] 직접 사용 — LDR 이 제목/링크/snippet 을 이미 준다.
    # 구조: {"id": openalex/url, "title": ..., "link": doi/url, "snippet": 초록}.
    sources = result.get("sources") if isinstance(result, dict) else None
    if isinstance(sources, list):
        for s in sources:
            if not isinstance(s, dict):
                continue
            url = s.get("link") or s.get("id") or s.get("url")
            if not url:
                continue
            # 이 소스가 가진 모든 식별자 후보 → 그 중 1순위(link→id→url→snippet)로 적재,
            # 나머지는 claimed 에 넣어 폴백이 같은 논문을 다른 id 로 또 안 넣게 한다.
            idents = []
            for cand in (s.get("link"), s.get("id"), s.get("url"), s.get("snippet")):
                if cand:
                    a = _url_to_identity(str(cand))
                    if a:
                        idents.append(a)
            if not idents:
                continue
            for a in idents:
                claimed.add(f"{a[0]}:{a[1]}")
            ident = idents[0]
            key = f"{ident[0]}:{ident[1]}"
            if key in seen:
                continue
            seen[key] = {
                "source": ident[0],
                "external_id": ident[1],
                "url": str(url),
                "title": (s.get("title") or ident[1])[:2000],
                "abstract": ((s.get("snippet") or summary)[:5000] or None),
                "query": query,
            }

    # (2순위) 전체 문자열 재귀 수집 → URL 정규식 — sources 가 없거나 본문에 추가 링크가 박혀있을 때.
    urls: list[str] = []
    for b in blobs:
        urls.extend(_URL_RE.findall(b))
    for u in urls:
        ident = _url_to_identity(u)
        if not ident:
            continue
        key = f"{ident[0]}:{ident[1]}"
        if key in seen or key in claimed:
            continue
        seen[key] = {
            "source": ident[0],
            "external_id": ident[1],
            "url": u,
            "title": ident[1],  # best-effort (bare id) — 후속 enrich 대상
            "abstract": (summary[:1500] or None),
            "query": query,
        }
    logger.info(f"[deep_research] extracted {len(seen)} findings ({len(sources or [])} structured sources, {len(urls)} urls scanned)")
    return list(seen.values())


# ── enrich: 추출한 소스를 공식 메타(제목/초록)로 보강 → Arca 가 풍부한 입력으로 분석 ──
_ARXIV_NS = {"atom": "http://www.w3.org/2005/Atom"}


def _enrich_arxiv(ext_id: str) -> dict | None:
    try:
        r = get_with_retry(
            f"http://export.arxiv.org/api/query?id_list={ext_id}",
            timeout=20, retries=2, backoff=2.0,
        )
        e = ET.fromstring(r.content).find("atom:entry", _ARXIV_NS)
        if e is None:
            return None
        title = (e.findtext("atom:title", default="", namespaces=_ARXIV_NS) or "").strip()
        summary = (e.findtext("atom:summary", default="", namespaces=_ARXIV_NS) or "").strip()
        return {"title": title or None, "abstract": summary or None, "meta": {}}
    except Exception as ex:  # noqa: BLE001
        logger.debug(f"[enrich:arxiv] {ext_id} 실패: {ex}")
        return None


def _enrich_github(repo: str) -> dict | None:
    from app.config import settings
    headers = {"Accept": "application/vnd.github.v3+json"}
    if getattr(settings, "github_token", None):
        headers["Authorization"] = f"Bearer {settings.github_token}"
    try:
        r = get_with_retry(f"https://api.github.com/repos/{repo}", headers=headers, timeout=15, retries=2)
        if r.status_code != 200:
            return None
        d = r.json()
        return {
            "title": d.get("full_name") or repo,
            "abstract": d.get("description") or None,
            "meta": {
                "stars": d.get("stargazers_count"), "forks": d.get("forks_count"),
                "language": d.get("language"), "topics": d.get("topics", []),
            },
        }
    except Exception as ex:  # noqa: BLE001
        logger.debug(f"[enrich:github] {repo} 실패: {ex}")
        return None


def _enrich_hf(model_id: str) -> dict | None:
    try:
        r = get_with_retry(f"https://huggingface.co/api/models/{model_id}", timeout=15, retries=2)
        if r.status_code != 200:
            return None
        d = r.json()
        card = d.get("cardData") or {}
        return {
            "title": d.get("id") or model_id,
            "abstract": (card.get("summary") or card.get("description")) or None,
            "meta": {
                "downloads": d.get("downloads"), "likes": d.get("likes"),
                "pipeline_tag": d.get("pipeline_tag"), "tags": (d.get("tags") or [])[:20],
            },
        }
    except Exception as ex:  # noqa: BLE001
        logger.debug(f"[enrich:hf] {model_id} 실패: {ex}")
        return None


def enrich_findings(findings: list[dict]) -> list[dict]:
    """각 finding 을 소스 공식 메타로 보강(제목/초록/stats). 실패 시 bare 유지(graceful)."""
    enrichers = {"arxiv": _enrich_arxiv, "github": _enrich_github, "hf": _enrich_hf}
    enriched = 0
    for f in findings:
        fn = enrichers.get(f.get("source"))
        info = fn(f["external_id"]) if fn else None
        if not info:
            continue
        if info.get("title"):
            f["title"] = info["title"][:2000]
        if info.get("abstract"):
            f["abstract"] = info["abstract"][:5000]
        meta = {k: v for k, v in (info.get("meta") or {}).items() if v not in (None, [], "")}
        if meta:
            f["enrich_meta"] = meta
        enriched += 1
    logger.info(f"[deep_research] enriched {enriched}/{len(findings)} findings")
    return findings


async def ingest_findings(findings: list[dict]) -> dict:
    """findings → Item upsert (llm_score=0 → Arca 가 다음에 정리).

    on_conflict_do_nothing: 이미 가진 item(풍부한 데이터)을 LDR 의 빈약한 데이터로 덮지 않음.
    """
    new = 0
    async with SessionLocal() as db:
        for f in findings:
            md = {"discovered_via": "ldr", "ldr_query": f.get("query", "")}
            if f.get("enrich_meta"):
                md.update(f["enrich_meta"])
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
