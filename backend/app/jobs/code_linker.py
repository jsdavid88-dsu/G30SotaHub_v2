"""Paper → GitHub code linker.

For arXiv items in DB, search GitHub for matching implementations and
store top 3 results in item_metadata.code_links.

Uses httpx (not PyGithub) with a short timeout and no retries, so network
issues cause a fast fail rather than a 3-minute hang.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import SessionLocal
from app.models import Item

logger = logging.getLogger(__name__)

GITHUB_SEARCH_URL = "https://api.github.com/search/repositories"

STOP_WORDS = {
    "a", "an", "the", "for", "of", "and", "or", "with", "via", "to", "in",
    "on", "by", "from", "using", "through", "based", "towards", "learning",
    "models", "model", "aware", "free", "generation", "generative",
}


def _short_query(title: str, max_words: int = 5) -> str:
    if not title:
        return ""
    words = re.findall(r"[A-Za-z][A-Za-z0-9-]+", title)
    picks = [w for w in words if w.lower() not in STOP_WORDS and len(w) > 2]
    return " ".join(picks[:max_words])


def search_code_for_title(title: str, max_results: int = 3) -> list[dict]:
    """Search GitHub for repos matching the paper title.

    Fails fast: short timeout, no retries. Returns [] on any error.
    """
    query = _short_query(title)
    if not query:
        return []

    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "vfx-sota-monitor",
    }
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"

    params = {
        "q": query,
        "sort": "stars",
        "order": "desc",
        "per_page": str(max_results),
    }

    try:
        # short timeout + no retries — if it doesn't respond in 8s, skip
        with httpx.Client(timeout=8.0, follow_redirects=True) as client:
            r = client.get(GITHUB_SEARCH_URL, headers=headers, params=params)
            if r.status_code != 200:
                logger.debug(f"github search HTTP {r.status_code} for '{query}'")
                return []
            data = r.json()
            items = data.get("items") or []
            out: list[dict] = []
            for repo in items[:max_results]:
                out.append({
                    "name": repo.get("full_name", ""),
                    "url": repo.get("html_url", ""),
                    "stars": repo.get("stargazers_count", 0),
                    "description": (repo.get("description") or "")[:200],
                })
            return out
    except httpx.HTTPError as e:
        logger.debug(f"github search failed for '{query}': {type(e).__name__}")
        return []
    except Exception as e:
        logger.debug(f"github search error for '{query}': {e}")
        return []
    finally:
        # Gentle pacing for unauthenticated rate limit (10/min)
        time.sleep(0.3)


async def link_codes_for_item(db: AsyncSession, item: Item) -> int:
    if item.source != "arxiv":
        return 0
    md = dict(item.item_metadata or {})
    if md.get("code_links"):
        return 0
    loop = asyncio.get_running_loop()
    links = await loop.run_in_executor(None, lambda: search_code_for_title(item.title))
    if links:
        md["code_links"] = links
        item.item_metadata = md
        await db.commit()
        return len(links)
    # Record that we tried, so we don't retry every run
    md["code_links_checked"] = True
    item.item_metadata = md
    await db.commit()
    return 0


async def link_codes_for_arxiv_items(max_items: int = 20) -> int:
    async with SessionLocal() as db:
        stmt = (
            select(Item)
            .where(Item.source == "arxiv")
            .order_by(Item.discovered_at.desc())
            .limit(max_items)
        )
        items = list((await db.execute(stmt)).scalars().all())

        total = 0
        for item in items:
            md = item.item_metadata or {}
            if md.get("code_links") or md.get("code_links_checked"):
                continue
            added = await link_codes_for_item(db, item)
            total += added
            if added:
                logger.info(f"code_links[{item.external_id}] +{added}")

        logger.info(f"link_codes_for_arxiv_items: {total} links across {len(items)} items")
        return total
