"""Crawl orchestrator — runs sources, scores items, persists to DB."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants_vfx import FETCH_LIMITS, SOURCES
from app.database import SessionLocal
from app.models import Category, CrawlRun, Item, ItemCategory
from app.scoring.keyword import ScoreResult, infer_priority, score_items
from app.sources import (
    fetch_arxiv,
    fetch_github,
    fetch_huggingface,
    fetch_reddit,
    fetch_x,
)
from app.sources.base import FetchedItem

logger = logging.getLogger(__name__)

# Re-export as list for backward compat (admin.py imports this)
SOURCE_LABELS: list[str] = list(SOURCES)


async def _load_categories(db: AsyncSession) -> list[Category]:
    result = await db.execute(select(Category).order_by(Category.display_order))
    return list(result.scalars().all())


def _collect_arxiv_categories(cats: list[Category]) -> list[str]:
    """Return unique arXiv cs.* categories from seed data (falls back to defaults)."""
    out: list[str] = []
    for c in cats:
        for kw in c.keywords or []:
            if kw.startswith("cs."):
                out.append(kw)
    return list(dict.fromkeys(out)) if out else []


async def _fetch_source(source: str, cats: list[Category]) -> list[FetchedItem]:
    """Fetch items for one source across all categories."""
    loop = asyncio.get_running_loop()
    items: list[FetchedItem] = []

    if source == "arxiv":
        ax = FETCH_LIMITS["arxiv"]
        arxiv_cats = _collect_arxiv_categories(cats) or None
        items = await loop.run_in_executor(
            None, lambda: fetch_arxiv(arxiv_cats, ax["max_results"], ax["days_back"])
        )

    elif source == "github":
        gh = FETCH_LIMITS["github"]
        for cat in cats:
            try:
                sub = await loop.run_in_executor(
                    None,
                    lambda c=cat: fetch_github(
                        c.keywords or [], c.github_topics or [],
                        gh["days_back"], gh["per_category"],
                    ),
                )
                items.extend(sub)
            except Exception as e:
                logger.warning(f"GitHub fetch failed for {cat.slug}: {e}")

    elif source == "huggingface":
        hf = FETCH_LIMITS["huggingface"]
        for cat in cats:
            try:
                sub = await loop.run_in_executor(
                    None,
                    lambda c=cat: fetch_huggingface(
                        c.keywords or [], c.hf_tags or [],
                        hf["days_back"], hf["per_category"],
                    ),
                )
                items.extend(sub)
            except Exception as e:
                logger.warning(f"HF fetch failed for {cat.slug}: {e}")

    elif source == "reddit":
        rd = FETCH_LIMITS["reddit"]
        for cat in cats:
            try:
                sub = await loop.run_in_executor(
                    None,
                    lambda c=cat: fetch_reddit(
                        c.subreddits or [], c.keywords or [],
                        rd["days_back"], rd["per_category"],
                    ),
                )
                items.extend(sub)
            except Exception as e:
                logger.warning(f"Reddit fetch failed for {cat.slug}: {e}")

    elif source == "x":
        # fxtwitter has no timeline API — skipped unless tweet_ids provided
        pass

    # Dedupe within same source by external_id (newer source call may double)
    seen: dict[str, FetchedItem] = {}
    for it in items:
        key = it.external_id
        if key not in seen:
            seen[key] = it
    return list(seen.values())


async def _persist_items(
    db: AsyncSession,
    fetched: list[FetchedItem],
    scores: dict[str, ScoreResult],
    cat_by_slug: dict[str, Category],
) -> int:
    """Insert new items + category links. Returns count of new items inserted."""
    new_count = 0

    for item in fetched:
        key = f"{item.source}:{item.external_id}"
        score = scores.get(key)
        if not score:
            continue

        # Upsert item by (source, external_id)
        stmt = (
            sqlite_insert(Item)
            .values(
                source=item.source,
                external_id=item.external_id,
                url=item.url,
                title=item.title[:2000] if item.title else "(no title)",
                abstract=(item.abstract or "")[:10000] or None,
                authors=(item.authors or None),
                published_at=item.published_at,
                item_metadata=item.metadata or {},
                keyword_score=score.keyword_score,
                llm_score=0,
                priority=infer_priority(score.keyword_score, item.metadata),
                status="new",
            )
            .on_conflict_do_update(
                index_elements=["source", "external_id"],
                set_=dict(
                    title=item.title[:2000] if item.title else "(no title)",
                    abstract=(item.abstract or "")[:10000] or None,
                    item_metadata=item.metadata or {},
                    keyword_score=score.keyword_score,
                    priority=infer_priority(score.keyword_score, item.metadata),
                ),
            )
        )
        await db.execute(stmt)

        # Find the item id
        row = (
            await db.execute(
                select(Item.id).where(
                    Item.source == item.source, Item.external_id == item.external_id
                )
            )
        ).scalar_one_or_none()
        if not row:
            continue

        # Link to matched categories (idempotent)
        for cat_slug in score.matched_categories:
            cat = cat_by_slug.get(cat_slug)
            if not cat:
                continue
            link_stmt = (
                sqlite_insert(ItemCategory)
                .values(item_id=row, category_id=cat.id)
                .on_conflict_do_nothing(index_elements=["item_id", "category_id"])
            )
            await db.execute(link_stmt)

        new_count += 1

    await db.commit()
    return new_count


async def crawl_source(source: str) -> dict:
    """Run a single-source crawl. Returns stats dict."""
    assert source in SOURCE_LABELS, f"Unknown source: {source}"

    async with SessionLocal() as db:
        run = CrawlRun(source=source, started_at=datetime.utcnow())
        db.add(run)
        await db.commit()
        await db.refresh(run)

        try:
            cats = await _load_categories(db)
            cat_by_slug = {c.slug: c for c in cats}
            cat_keywords = {c.slug: c.keywords or [] for c in cats}

            fetched = await _fetch_source(source, cats)
            scores = score_items(fetched, cat_keywords, min_score=1)
            new_count = await _persist_items(db, fetched, scores, cat_by_slug)

            run.finished_at = datetime.utcnow()
            run.items_found = len(fetched)
            run.items_new = new_count
            await db.commit()

            logger.info(
                f"[crawl:{source}] fetched={len(fetched)} scored={len(scores)} new={new_count}"
            )
            return {
                "source": source,
                "fetched": len(fetched),
                "scored": len(scores),
                "new": new_count,
            }
        except Exception as e:
            logger.exception(f"crawl_source({source}) failed")
            run.finished_at = datetime.utcnow()
            run.error = str(e)[:2000]
            await db.commit()
            return {"source": source, "error": str(e)}


async def crawl_all() -> list[dict]:
    """Run all sources sequentially, then re-group items across sources."""
    results = []
    for src in SOURCE_LABELS:
        try:
            res = await crawl_source(src)
            results.append(res)
        except Exception as e:
            logger.exception(f"crawl_all: {src} errored")
            results.append({"source": src, "error": str(e)})

    # Unify same research across arxiv/github/huggingface into groups.
    # Runs after all sources so cross-source merging has complete data.
    try:
        from app.jobs.grouper import group_items

        stats = await group_items()
        results.append({"source": "grouper", **stats})
    except Exception as e:
        logger.exception("crawl_all: grouper errored")
        results.append({"source": "grouper", "error": str(e)})

    return results
