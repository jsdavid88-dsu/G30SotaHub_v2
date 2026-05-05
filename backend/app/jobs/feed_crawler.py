"""Feed crawler — orchestrates all feed sources and persists feed_items.

Sources (in order):
  1. YouTube RSS (channel feeds, no API key)
  2. X/Twitter (nitter RSS → Crawl4AI fallback)
  3. HuggingFace trending (daily papers + spaces API)
  4. PapersWithCode (public API)
  5. Crawl4AI web search (Google, supplementary)
  6. Reddit (PRAW)

Scheduled via APScheduler. Can also be triggered manually via admin API.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from pathlib import Path

import yaml
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import SessionLocal
from app.models import CrawlRun, FeedItem

logger = logging.getLogger(__name__)

CONFIG_PATH = Path(__file__).resolve().parent.parent.parent / "feed_queries.yaml"


def _load_config() -> dict:
    if not CONFIG_PATH.exists():
        logger.warning(f"feed_queries.yaml not found at {CONFIG_PATH}")
        return {}
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


async def _persist(db: AsyncSession, items: list[dict]) -> int:
    """Upsert feed items, return count of new rows."""
    new_count = 0
    for it in items:
        stmt = (
            sqlite_insert(FeedItem)
            .values(
                source=it["source"],
                external_id=it["external_id"],
                url=it["url"],
                title=it["title"][:2000] if it.get("title") else "(no title)",
                excerpt=it.get("excerpt"),
                content_md=it.get("content_md"),
                image_url=it.get("image_url"),
                author=it.get("author"),
                published_at=it.get("published_at"),
                tags=it.get("tags", []),
                feed_metadata=it.get("feed_metadata", {}),
            )
            .on_conflict_do_nothing(index_elements=["source", "external_id"])
        )
        result = await db.execute(stmt)
        if result.rowcount:
            new_count += 1
    await db.commit()
    return new_count


# ── Source runners ───────────────────────────────────────────

def _run_youtube(cfg: dict) -> list[dict]:
    channels = cfg.get("youtube_channels", [])
    if not channels or not isinstance(channels, list):
        return []
    from app.sources.feed_youtube import fetch_youtube_feed
    return fetch_youtube_feed(channels, max_per_channel=cfg.get("max_per_channel", 5))


def _run_x(cfg: dict) -> list[dict]:
    accounts = cfg.get("x_accounts", [])
    if not accounts or not isinstance(accounts, list):
        return []
    from app.sources.feed_x import fetch_x_feed
    return fetch_x_feed(accounts, max_per_account=cfg.get("max_per_account", 10))


def _run_hf_trending(cfg: dict) -> list[dict]:
    hf_cfg = cfg.get("huggingface_trending", {})
    if not hf_cfg:
        return []
    from app.sources.feed_hf_trending import fetch_hf_trending
    return fetch_hf_trending(hf_cfg)


def _run_paperswithcode(cfg: dict) -> list[dict]:
    pwc_cfg = cfg.get("paperswithcode", {})
    if not pwc_cfg:
        return []
    from app.sources.feed_paperswithcode import fetch_paperswithcode_feed
    return fetch_paperswithcode_feed(pwc_cfg)


def _run_crawl4ai(cfg: dict) -> list[dict]:
    queries = cfg.get("crawl4ai_queries") or cfg.get("firecrawl_queries") or []
    if not queries:
        return []
    from app.sources.crawl4ai_src import fetch_crawl4ai_feed
    return fetch_crawl4ai_feed(queries)


def _run_reddit(cfg: dict) -> list[dict]:
    rcfg = cfg.get("reddit", {})
    if not rcfg:
        return []
    from app.sources.feed_reddit import fetch_reddit_feed
    return fetch_reddit_feed(
        rcfg.get("subreddits", []),
        rcfg.get("keywords", []),
        rcfg.get("days_back", 3),
        rcfg.get("max_per_sub", 15),
    )


# Source registry: (name, runner, needs_async)
FEED_SOURCES = [
    ("youtube", _run_youtube, False),
    ("x", _run_x, False),
    ("hf_trending", _run_hf_trending, False),
    ("paperswithcode", _run_paperswithcode, False),
    ("crawl4ai", _run_crawl4ai, False),
    ("reddit", _run_reddit, False),
]


async def crawl_feed_source(source: str) -> dict:
    """Run a single feed source."""
    cfg = _load_config()
    loop = asyncio.get_running_loop()

    runner = None
    for name, fn, _ in FEED_SOURCES:
        if name == source:
            runner = fn
            break

    if not runner:
        return {"source": source, "error": f"Unknown feed source: {source}"}

    async with SessionLocal() as db:
        run = CrawlRun(source=f"feed_{source}", started_at=datetime.utcnow())
        db.add(run)
        await db.commit()
        await db.refresh(run)

        try:
            items = await loop.run_in_executor(None, lambda: runner(cfg))
            new_count = await _persist(db, items)

            run.finished_at = datetime.utcnow()
            run.items_found = len(items)
            run.items_new = new_count
            await db.commit()

            logger.info(f"[feed:{source}] fetched={len(items)} new={new_count}")
            return {"source": source, "fetched": len(items), "new": new_count}

        except Exception as e:
            logger.exception(f"feed crawl_source({source}) failed")
            run.finished_at = datetime.utcnow()
            run.error = str(e)[:2000]
            await db.commit()
            return {"source": source, "error": str(e)}


async def crawl_feed_all() -> list[dict]:
    """Run all feed sources sequentially."""
    results = []
    for name, _, _ in FEED_SOURCES:
        results.append(await crawl_feed_source(name))
    return results
