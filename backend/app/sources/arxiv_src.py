"""arXiv source — fetch recent papers in cs.* categories.

Uses the arXiv Atom API (no auth, free).
Docs: https://info.arxiv.org/help/api/user-manual.html
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from xml.etree import ElementTree as ET

import httpx

from app.sources.base import FetchedItem, get_with_retry

logger = logging.getLogger(__name__)

ARXIV_API = "http://export.arxiv.org/api/query"
ATOM_NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "arxiv": "http://arxiv.org/schemas/atom",
}

# VFX-relevant cs subcategories
DEFAULT_CATEGORIES = [
    "cs.CV",  # Computer Vision
    "cs.GR",  # Graphics
    "cs.MM",  # Multimedia
    "cs.LG",  # Machine Learning
]


def _parse_entry(entry: ET.Element) -> FetchedItem | None:
    try:
        arxiv_id_url = entry.findtext("atom:id", default="", namespaces=ATOM_NS)
        # id format: http://arxiv.org/abs/2604.01234v1 → 2604.01234
        ext_id = arxiv_id_url.rsplit("/", 1)[-1].split("v")[0] if arxiv_id_url else ""
        if not ext_id:
            return None

        title = (entry.findtext("atom:title", default="", namespaces=ATOM_NS) or "").strip()
        summary = (entry.findtext("atom:summary", default="", namespaces=ATOM_NS) or "").strip()

        authors = []
        for a in entry.findall("atom:author", ATOM_NS):
            name = a.findtext("atom:name", default="", namespaces=ATOM_NS)
            if name:
                authors.append(name.strip())

        published_str = entry.findtext("atom:published", default="", namespaces=ATOM_NS)
        published_at: datetime | None = None
        if published_str:
            try:
                published_at = datetime.fromisoformat(published_str.replace("Z", "+00:00"))
            except ValueError:
                published_at = None

        # Subject categories (primary + secondary)
        categories = []
        for cat in entry.findall("atom:category", ATOM_NS):
            term = cat.get("term")
            if term:
                categories.append(term)

        pdf_link = None
        for link in entry.findall("atom:link", ATOM_NS):
            if link.get("type") == "application/pdf":
                pdf_link = link.get("href")
                break

        return FetchedItem(
            source="arxiv",
            external_id=ext_id,
            url=f"https://arxiv.org/abs/{ext_id}",
            title=title,
            abstract=summary,
            authors=", ".join(authors) if authors else None,
            published_at=published_at,
            metadata={
                "categories": categories,
                "pdf_url": pdf_link,
            },
        )
    except Exception as e:
        logger.warning(f"Failed to parse arxiv entry: {e}")
        return None


def fetch_arxiv(
    categories: list[str] | None = None,
    max_results: int = 100,
    days_back: int = 2,
) -> list[FetchedItem]:
    """Fetch recent papers from arXiv.

    Args:
        categories: cs categories, e.g. ["cs.CV", "cs.GR"]
        max_results: hard cap per query
        days_back: unused at API level (arXiv sorts by submission, we post-filter)
    """
    cats = categories or DEFAULT_CATEGORIES
    cat_query = "+OR+".join(f"cat:{c}" for c in cats)

    params = {
        "search_query": cat_query,
        "sortBy": "submittedDate",
        "sortOrder": "descending",
        "max_results": str(max_results),
    }
    # httpx URL-encodes; but arXiv wants raw '+OR+' — build URL manually
    url = f"{ARXIV_API}?search_query={cat_query}&sortBy=submittedDate&sortOrder=descending&max_results={max_results}"

    logger.info(f"[arxiv] cats={cats}, days_back={days_back}, max={max_results}")
    logger.info(f"[arxiv] GET {url}")
    try:
        resp = get_with_retry(url, timeout=60, follow_redirects=True)
        resp.raise_for_status()
    except httpx.HTTPError as e:
        logger.error(f"[arxiv] HTTP failed (재시도 후): {e}")
        return []

    logger.info(f"[arxiv] resp status={resp.status_code}, content_len={len(resp.content)}")

    try:
        root = ET.fromstring(resp.content)
    except ET.ParseError as e:
        logger.error(f"[arxiv] XML parse failed: {e} (resp first 500: {resp.text[:500]!r})")
        return []

    all_entries = root.findall("atom:entry", ATOM_NS)
    items: list[FetchedItem] = []
    cutoff = datetime.now(timezone.utc).timestamp() - days_back * 86400
    skipped_old = 0
    skipped_parse = 0

    for entry in all_entries:
        item = _parse_entry(entry)
        if not item:
            skipped_parse += 1
            continue
        if item.published_at and item.published_at.timestamp() < cutoff:
            skipped_old += 1
            continue
        items.append(item)

    logger.info(
        f"[arxiv] entries={len(all_entries)} → kept={len(items)} "
        f"(skipped_old={skipped_old}, parse_fail={skipped_parse}, cutoff={days_back}d)"
    )
    if not items and len(all_entries) == 0:
        # API 가 응답은 줬는데 entries 0개 — query 형식 의심
        logger.warning(
            f"[arxiv] response had 0 entries — check query syntax. "
            f"Response sample: {resp.text[:300]!r}"
        )
    return items
