"""PapersWithCode feed — trending papers via Crawl4AI scraping.

Note: PapersWithCode API now redirects to HuggingFace.
We scrape their trending page instead.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import re

os.environ.setdefault("PYTHONIOENCODING", "utf-8")

import httpx

from app.sources.base import get_with_retry

logger = logging.getLogger(__name__)


def fetch_paperswithcode_feed(cfg: dict) -> list[dict]:
    """Fetch latest papers from PapersWithCode greatest/latest page."""
    max_items = cfg.get("max_items", 15)
    tags = cfg.get("tags", ["paper", "code"])
    items: list[dict] = []

    try:
        # #7: getaddrinfo(DNS)/일시 네트워크 오류에 재시도 (get_with_retry). httpx.get 직접 호출 X.
        r = get_with_retry(
            "https://paperswithcode.com/latest",
            timeout=15,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 VFX-SOTA-Monitor"},
            retries=3,
            backoff=2.0,
        )
        if r.status_code != 200:
            logger.warning(f"PapersWithCode: HTTP {r.status_code}")
            return []

        # Simple regex extraction from HTML
        # Paper cards have: <h1><a href="/paper/...">Title</a></h1>
        pattern = re.compile(
            r'<h1>\s*<a href="(/paper/[^"]+)"[^>]*>([^<]+)</a>',
            re.IGNORECASE,
        )
        matches = pattern.findall(r.text)

        for path, title in matches[:max_items]:
            title = title.strip()
            url = f"https://paperswithcode.com{path}"
            eid = hashlib.sha1(path.encode()).hexdigest()[:16]

            items.append({
                "source": "paperswithcode",
                "external_id": f"pwc_{eid}",
                "url": url,
                "title": title[:500],
                "excerpt": None,
                "content_md": None,
                "image_url": None,
                "author": None,
                "published_at": None,
                "tags": tags,
                "feed_metadata": {},
            })

    except Exception as e:
        logger.warning(f"PapersWithCode failed: {e}")

    logger.info(f"PapersWithCode: {len(items)} papers")
    return items
