"""Semantic Scholar API — fetch paper references/citations.

Free, no API key required (rate-limited to ~1 req/sec).
Docs: https://api.semanticscholar.org/api-docs
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

SS_BASE = "https://api.semanticscholar.org/graph/v1"
ARXIV_PREFIX = "arXiv:"


@dataclass
class PaperRef:
    paper_id: str  # Semantic Scholar ID
    external_ids: dict  # e.g., {"ArXiv": "2604.01234", "DOI": "..."}
    title: str
    year: int | None = None
    abstract: str | None = None


def _fetch_paper(arxiv_id: str) -> dict | None:
    """Fetch a single paper's full record including references/citations."""
    url = f"{SS_BASE}/paper/{ARXIV_PREFIX}{arxiv_id}"
    params = {
        "fields": "paperId,title,year,abstract,externalIds,references,citations,"
        "references.paperId,references.title,references.year,references.externalIds,"
        "citations.paperId,citations.title,citations.year,citations.externalIds",
    }
    try:
        r = httpx.get(url, params=params, timeout=30)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.json()
    except httpx.HTTPError as e:
        logger.warning(f"Semantic Scholar fetch failed for {arxiv_id}: {e}")
        return None


def _to_paper_ref(raw: dict) -> PaperRef | None:
    pid = raw.get("paperId")
    title = raw.get("title")
    if not pid or not title:
        return None
    return PaperRef(
        paper_id=pid,
        external_ids=raw.get("externalIds") or {},
        title=title,
        year=raw.get("year"),
        abstract=raw.get("abstract"),
    )


def fetch_paper_relations(arxiv_id: str) -> tuple[list[PaperRef], list[PaperRef]]:
    """Return (references, citations) for the given arXiv paper.

    - references: papers this one cites (parents in lineage)
    - citations: papers that cite this one (children in lineage)
    """
    # Polite rate limiting — S2 unauthenticated is ~1/sec
    time.sleep(1.1)

    data = _fetch_paper(arxiv_id)
    if not data:
        return [], []

    refs: list[PaperRef] = []
    for r in data.get("references") or []:
        p = _to_paper_ref(r)
        if p:
            refs.append(p)

    cites: list[PaperRef] = []
    for c in data.get("citations") or []:
        p = _to_paper_ref(c)
        if p:
            cites.append(p)

    return refs, cites


def arxiv_id_from_external(external_ids: dict) -> str | None:
    """Extract an arXiv ID from Semantic Scholar externalIds dict."""
    if not external_ids:
        return None
    return external_ids.get("ArXiv") or external_ids.get("arXiv")
