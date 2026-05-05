"""Firecrawl source — web search + content extraction via self-hosted Firecrawl.

Expects Firecrawl running at settings.firecrawl_base_url (default http://localhost:3002).
Falls back gracefully if Firecrawl is unreachable: returns empty list.
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


def _is_firecrawl_up() -> bool:
    if not settings.firecrawl_enabled or not settings.firecrawl_base_url:
        return False
    try:
        with httpx.Client(timeout=3.0) as c:
            r = c.get(f"{settings.firecrawl_base_url}/v1/health")
            return r.status_code in (200, 404)  # 404 also means server alive
    except httpx.HTTPError:
        return False


def search_firecrawl(query: str, limit: int = 5, tags: list[str] | None = None) -> list[dict]:
    """Call Firecrawl /v1/search and return list of feed_item dicts.

    Firecrawl response format (typical):
    {
      "success": true,
      "data": [
        {
          "title": "...",
          "description": "...",
          "url": "https://...",
          "markdown": "...",     # if scrapeOptions.formats includes markdown
          "metadata": {...}
        },
        ...
      ]
    }
    """
    if not _is_firecrawl_up():
        logger.debug("Firecrawl not reachable, skipping search")
        return []

    url = f"{settings.firecrawl_base_url}/v1/search"
    payload: dict[str, Any] = {
        "query": query,
        "limit": limit,
        "scrapeOptions": {
            "formats": ["markdown"],
            "onlyMainContent": True,
            "waitFor": 1000,
        },
    }

    try:
        with httpx.Client(timeout=120.0) as c:
            r = c.post(url, json=payload)
            if r.status_code != 200:
                logger.warning(f"firecrawl search {r.status_code}: {r.text[:200]}")
                return []
            data = r.json()
    except httpx.HTTPError as e:
        logger.warning(f"firecrawl search failed for '{query}': {e}")
        return []

    if not isinstance(data, dict) or not data.get("success", True):
        return []

    results = data.get("data") or data.get("results") or []
    out: list[dict] = []
    for r in results:
        if not isinstance(r, dict):
            continue
        result_url = r.get("url") or r.get("link") or ""
        title = r.get("title") or r.get("metadata", {}).get("title") or ""
        if not result_url or not title:
            continue

        markdown = r.get("markdown") or r.get("content") or ""
        description = r.get("description") or r.get("excerpt") or ""
        if not description and markdown:
            description = markdown[:400].strip()

        metadata = r.get("metadata") or {}
        image_url = (
            metadata.get("ogImage")
            or metadata.get("og:image")
            or metadata.get("image")
        )
        author = metadata.get("author") or metadata.get("og:site_name")

        # Try to parse published date
        published = None
        for key in ("publishedTime", "published_time", "datePublished", "article:published_time"):
            val = metadata.get(key)
            if val:
                try:
                    published = datetime.fromisoformat(str(val).replace("Z", "+00:00"))
                    break
                except ValueError:
                    pass

        # external_id: hash of URL so we dedupe across runs
        external_id = hashlib.sha1(result_url.encode("utf-8")).hexdigest()[:24]

        out.append({
            "source": "firecrawl",
            "external_id": external_id,
            "url": result_url,
            "title": title[:500],
            "excerpt": (description or "")[:1000] or None,
            "content_md": (markdown or "")[:30000] or None,
            "image_url": image_url,
            "author": author,
            "published_at": published,
            "tags": tags or [],
            "feed_metadata": {
                "search_query": query,
                "domain": metadata.get("sourceURL") or metadata.get("og:url"),
            },
        })

    logger.info(f"firecrawl: '{query}' -> {len(out)} results")
    return out


def fetch_firecrawl_feed(queries: list[dict]) -> list[dict]:
    """Run all configured Firecrawl queries."""
    all_items: list[dict] = []
    for q in queries:
        query_text = q.get("query", "")
        if not query_text:
            continue
        tags = q.get("tags", [])
        limit = int(q.get("limit", 5))
        all_items.extend(search_firecrawl(query_text, limit=limit, tags=tags))
    return all_items
