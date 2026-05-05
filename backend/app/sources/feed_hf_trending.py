"""HuggingFace trending feed — daily papers + trending spaces.

Uses public HF API (no token required for read).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)

HF_API = "https://huggingface.co/api"


def _fetch_daily_papers(max_items: int) -> list[dict]:
    """Fetch HuggingFace daily papers."""
    try:
        r = httpx.get(f"{HF_API}/daily_papers", timeout=15)
        if r.status_code != 200:
            logger.warning(f"HF daily_papers: HTTP {r.status_code}")
            return []

        papers = r.json()
        items = []
        for p in papers[:max_items]:
            paper = p.get("paper", {})
            arxiv_id = paper.get("id", "")
            title = paper.get("title", "")
            if not arxiv_id or not title:
                continue

            published = p.get("publishedAt")
            published_at = None
            if published:
                try:
                    published_at = datetime.fromisoformat(published.replace("Z", "+00:00"))
                except ValueError:
                    pass

            items.append({
                "source": "hf_paper",
                "external_id": f"hf_paper_{arxiv_id}",
                "url": f"https://huggingface.co/papers/{arxiv_id}",
                "title": title[:500],
                "excerpt": (paper.get("summary") or "")[:1000] or None,
                "content_md": None,
                "image_url": p.get("thumbnail"),
                "author": ", ".join(a.get("name", "") for a in (paper.get("authors") or [])[:3]),
                "published_at": published_at,
                "tags": ["huggingface", "paper", "trending"],
                "feed_metadata": {
                    "arxiv_id": arxiv_id,
                    "upvotes": p.get("paper", {}).get("upvotes", 0),
                },
            })

        logger.info(f"HF daily papers: {len(items)}")
        return items

    except Exception as e:
        logger.warning(f"HF daily_papers failed: {e}")
        return []


def _fetch_trending_spaces(max_items: int) -> list[dict]:
    """Fetch HuggingFace trending spaces."""
    try:
        r = httpx.get(
            f"{HF_API}/spaces",
            params={"sort": "likes", "direction": "-1", "limit": max_items},
            timeout=15,
        )
        if r.status_code != 200:
            logger.warning(f"HF spaces: HTTP {r.status_code}")
            return []

        spaces = r.json()
        items = []
        for s in spaces:
            space_id = s.get("id", "")
            if not space_id:
                continue

            items.append({
                "source": "hf_space",
                "external_id": f"hf_space_{space_id}",
                "url": f"https://huggingface.co/spaces/{space_id}",
                "title": (s.get("cardData", {}).get("title") or space_id)[:500],
                "excerpt": (s.get("cardData", {}).get("short_description") or "")[:1000] or None,
                "content_md": None,
                "image_url": None,
                "author": s.get("author", ""),
                "published_at": None,
                "tags": ["huggingface", "space", "trending"],
                "feed_metadata": {
                    "likes": s.get("likes", 0),
                    "sdk": s.get("sdk", ""),
                },
            })

        logger.info(f"HF trending spaces: {len(items)}")
        return items

    except Exception as e:
        logger.warning(f"HF spaces failed: {e}")
        return []


def fetch_hf_trending(cfg: dict) -> list[dict]:
    """Fetch HF daily papers + trending spaces."""
    items: list[dict] = []
    if cfg.get("papers", True):
        items.extend(_fetch_daily_papers(cfg.get("max_papers", 10)))
    if cfg.get("spaces", True):
        items.extend(_fetch_trending_spaces(cfg.get("max_spaces", 10)))
    return items
