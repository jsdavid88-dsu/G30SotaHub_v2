"""Night batch pipeline — runs at 21:00 KST daily.

Gemma4 (Arca) is the brain for every AI-powered step:

1. Process pending submissions (Crawl4AI + Gemma4 analysis)
2. Filter today's feed items (Gemma4: "VFX 관련?")
3. Score unscored items (Gemma4: relevancy + priority + verdict)
4. Tag assignment (Gemma4: free_tags for uncategorized items)
5. Grouper (cross-source matching)
6. Category promotion detection (Gemma4: tag analysis → suggestion)

All steps are sequential and fault-tolerant.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func, text, update as sql_update
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import SessionLocal
from app.models import Item, ItemCategory, FeedItem, Submission, CategorySuggestion

logger = logging.getLogger(__name__)

PROMOTION_THRESHOLD = 5
SCORE_BATCH_SIZE = 5


# ── Step 1: Submissions ─────────────────────────────────────

async def step_process_submissions() -> dict:
    """Process pending submissions with Crawl4AI."""
    processed = 0
    failed = 0

    async with SessionLocal() as db:
        stmt = select(Submission).where(Submission.status == "pending").order_by(Submission.created_at)
        subs = list((await db.execute(stmt)).scalars().all())

        for sub in subs:
            sub.status = "processing"
            await db.flush()

            item_id = None
            try:
                if sub.input_type == "url":
                    item_id = await _process_url_submission(db, sub)
                elif sub.input_type == "keyword":
                    item_id = await _process_keyword_submission(db, sub)
            except Exception as e:
                logger.warning(f"Submission {sub.id} failed: {e}")

            if item_id:
                sub.status = "done"
                sub.result_item_id = item_id
                processed += 1
            else:
                sub.status = "rejected"
                sub.reject_reason = "크롤 실패 또는 유의미한 결과 없음"
                failed += 1

            sub.processed_at = datetime.now(timezone.utc)

        await db.commit()

    logger.info(f"[night] submissions: {processed} done, {failed} failed")
    return {"step": "submissions", "processed": processed, "failed": failed}


async def _process_url_submission(db: AsyncSession, sub: Submission) -> int | None:
    from app.sources.crawl4ai_src import _crawl_url
    page = await _crawl_url(sub.input_value)
    if not page:
        return None

    external_id = hashlib.sha1(sub.input_value.encode()).hexdigest()[:24]
    stmt = (
        sqlite_insert(Item)
        .values(
            source="submission", external_id=external_id, url=sub.input_value,
            title=(page.get("title") or sub.input_value[:200])[:2000],
            abstract=(page.get("description") or (page.get("markdown") or "")[:500])[:5000] or None,
            item_metadata={"submitted_by": sub.submitted_by, "submission_id": sub.id},
            keyword_score=0, llm_score=0, priority="WATCH", status="submitted",
            free_tags=["제보"],
        )
        .on_conflict_do_nothing(index_elements=["source", "external_id"])
    )
    await db.execute(stmt)
    await db.flush()
    return (await db.execute(
        select(Item.id).where(Item.source == "submission", Item.external_id == external_id)
    )).scalar_one_or_none()


async def _process_keyword_submission(db: AsyncSession, sub: Submission) -> int | None:
    from app.sources.crawl4ai_src import search_crawl4ai
    results = await search_crawl4ai(sub.input_value, limit=1, tags=["제보"])
    if not results:
        return None

    best = results[0]
    external_id = hashlib.sha1(best["url"].encode()).hexdigest()[:24]
    stmt = (
        sqlite_insert(Item)
        .values(
            source="submission", external_id=external_id, url=best["url"],
            title=(best.get("title") or sub.input_value)[:2000],
            abstract=(best.get("excerpt") or "")[:5000] or None,
            item_metadata={"submitted_by": sub.submitted_by, "submission_id": sub.id},
            keyword_score=0, llm_score=0, priority="WATCH", status="submitted",
            free_tags=["제보"],
        )
        .on_conflict_do_nothing(index_elements=["source", "external_id"])
    )
    await db.execute(stmt)
    await db.flush()
    return (await db.execute(
        select(Item.id).where(Item.source == "submission", Item.external_id == external_id)
    )).scalar_one_or_none()


# ── Step 2: Feed Filtering (Gemma4) ─────────────────────────

async def step_filter_feed() -> dict:
    """Gemma4 filters today's new feed items for VFX relevance."""
    from app.jobs.arca_brain import filter_feed_items

    kept = 0
    removed = 0

    async with SessionLocal() as db:
        # Get feed items from last 24h that haven't been filtered yet
        since = datetime.now(timezone.utc) - timedelta(hours=24)
        stmt = select(FeedItem).where(
            FeedItem.discovered_at >= since,
        ).order_by(FeedItem.discovered_at.desc()).limit(100)
        feed_items = list((await db.execute(stmt)).scalars().all())

        if not feed_items:
            return {"step": "feed_filter", "kept": 0, "removed": 0, "total": 0}

        # Build dicts for Gemma
        item_dicts = [
            {"title": fi.title, "excerpt": fi.excerpt, "source": fi.source}
            for fi in feed_items
        ]

        # Call Gemma4 in batches
        batch_size = 20
        for i in range(0, len(item_dicts), batch_size):
            batch = item_dicts[i:i + batch_size]
            batch_feed = feed_items[i:i + batch_size]

            results = await asyncio.get_running_loop().run_in_executor(
                None, lambda b=batch: filter_feed_items(b)
            )

            for j, result in enumerate(results):
                if j >= len(batch_feed):
                    break
                fi = batch_feed[j]

                relevant = result.get("relevant", True)
                tags = result.get("tags", [])

                if relevant:
                    fi.tags = list(set((fi.tags or []) + tags))
                    kept += 1
                else:
                    # Mark as irrelevant (don't delete, just tag)
                    fi.tags = list(set((fi.tags or []) + ["_irrelevant"]))
                    removed += 1

        await db.commit()

    logger.info(f"[night] feed filter: {kept} kept, {removed} removed (out of {len(feed_items)})")
    return {"step": "feed_filter", "kept": kept, "removed": removed, "total": len(feed_items)}


# ── Step 3: Item Scoring (Gemma4) ────────────────────────────

async def step_score_items() -> dict:
    """Gemma4 scores unscored items (llm_score=0)."""
    from app.jobs.arca_brain import score_items

    scored = 0

    async with SessionLocal() as db:
        stmt = select(Item).where(Item.llm_score == 0).order_by(
            Item.discovered_at.desc()
        ).limit(50)
        items = list((await db.execute(stmt)).scalars().all())

        if not items:
            return {"step": "scoring", "scored": 0, "total": 0}

        # Score in batches
        for i in range(0, len(items), SCORE_BATCH_SIZE):
            batch = items[i:i + SCORE_BATCH_SIZE]
            batch_dicts = [
                {"source": it.source, "title": it.title, "abstract": it.abstract}
                for it in batch
            ]

            results = await asyncio.get_running_loop().run_in_executor(
                None, lambda b=batch_dicts: score_items(b)
            )

            for j, result in enumerate(results):
                if j >= len(batch):
                    break
                item = batch[j]

                score = result.get("relevancy_score", 0)
                try:
                    score = max(0, min(10, int(score)))
                except (TypeError, ValueError):
                    score = 0

                item.llm_score = score
                item.priority = result.get("priority", "WATCH")
                item.llm_reason = str(result.get("reason", ""))[:500]

                # Free tags from Gemma
                new_tags = result.get("tags", [])
                if new_tags:
                    existing = item.free_tags or []
                    item.free_tags = list(set(existing + new_tags))

                # Store verdict in metadata
                md = dict(item.item_metadata or {})
                md["arca"] = {
                    "verdict": str(result.get("verdict", ""))[:300],
                    "category": result.get("category", ""),
                }
                item.item_metadata = md

                scored += 1

        await db.commit()

    logger.info(f"[night] scoring: {scored} items scored")
    return {"step": "scoring", "scored": scored, "total": len(items)}


# ── Step 4: Grouper ─────────────────────────────────────────

async def step_run_grouper() -> dict:
    """Re-run item grouper for cross-source matching."""
    try:
        from app.jobs.grouper import group_items
        result = await group_items()
        logger.info(f"[night] grouper: {result}")
        return {"step": "grouper", **result}
    except Exception as e:
        logger.exception("[night] grouper failed")
        return {"step": "grouper", "error": str(e)}


# ── Step 5: Category Promotion (Gemma4) ─────────────────────

async def step_detect_promotions() -> dict:
    """Aggregate tags, ask Gemma4 to suggest new categories."""
    from app.jobs.arca_brain import suggest_category_promotion

    new_suggestions = 0

    async with SessionLocal() as db:
        # Count free_tags
        stmt = text("""
            SELECT j.value AS tag, COUNT(*) AS cnt
            FROM items, json_each(items.free_tags) AS j
            WHERE j.value NOT IN ('제보', '_irrelevant')
            GROUP BY j.value
            HAVING cnt >= :threshold
            ORDER BY cnt DESC
        """)
        rows = (await db.execute(stmt, {"threshold": PROMOTION_THRESHOLD})).fetchall()

        for tag, count in rows:
            existing = (await db.execute(
                select(CategorySuggestion).where(CategorySuggestion.tag == tag)
            )).scalar_one_or_none()

            if existing:
                existing.item_count = count
                continue

            # Get sample titles for this tag
            sample_stmt = text("""
                SELECT i.title FROM items i, json_each(i.free_tags) AS j
                WHERE j.value = :tag LIMIT 5
            """)
            samples = [r[0] for r in (await db.execute(sample_stmt, {"tag": tag})).fetchall()]

            # Ask Gemma4
            suggestion = await asyncio.get_running_loop().run_in_executor(
                None, lambda t=tag, c=count, s=samples: suggest_category_promotion(t, c, s)
            )

            if suggestion and suggestion.get("should_promote"):
                sug = CategorySuggestion(
                    tag=tag,
                    item_count=count,
                    suggested_name_ko=suggestion.get("suggested_name_ko"),
                    suggested_name_en=suggestion.get("suggested_name_en"),
                    suggested_keywords=suggestion.get("suggested_keywords", []),
                    arca_reason=suggestion.get("reason"),
                    status="pending",
                )
                db.add(sug)
                new_suggestions += 1

        await db.commit()

    logger.info(f"[night] promotions: {len(rows)} tags, {new_suggestions} new suggestions")
    return {"step": "promotions", "tags_above_threshold": len(rows), "new_suggestions": new_suggestions}


# ── Main Pipeline ────────────────────────────────────────────

async def step_crawl_all_sources() -> dict:
    """Step 0: Fresh crawl of all sources before analysis."""
    try:
        from app.jobs.crawler import crawl_all
        from app.jobs.feed_crawler import crawl_feed_all

        # Research sources (arxiv/github/hf/reddit)
        research_results = await crawl_all()
        research_new = sum(r.get("new", 0) for r in research_results if isinstance(r, dict))

        # Feed sources (youtube/x/hf_trending/crawl4ai/reddit)
        feed_results = await crawl_feed_all()
        feed_new = sum(r.get("new", 0) for r in feed_results if isinstance(r, dict))

        logger.info(f"[night] crawl: research={research_new} new, feed={feed_new} new")
        return {"step": "crawl", "research_new": research_new, "feed_new": feed_new}
    except Exception as e:
        logger.exception("[night] crawl failed")
        return {"step": "crawl", "error": str(e)}


async def run_night_batch() -> list[dict]:
    """Full night batch pipeline with Gemma4 brain.

    0. Crawl all sources (fresh data)
    1. Process submissions (Crawl4AI)
    2. Filter feed items (Gemma4)
    3. Score unscored items (Gemma4)
    4. Grouper
    5. Category promotion (Gemma4)
    """
    logger.info("========== Night Batch Started ==========")
    results = []

    # Step 0: Fresh crawl
    r = await step_crawl_all_sources()
    results.append(r)

    # Step 1: Process submissions (Crawl4AI)
    r = await step_process_submissions()
    results.append(r)

    # Step 2: Filter feed items (Gemma4)
    r = await step_filter_feed()
    results.append(r)

    # Step 3: Score unscored items (Gemma4)
    r = await step_score_items()
    results.append(r)

    # Step 4: Grouper (no Gemma)
    r = await step_run_grouper()
    results.append(r)

    # Step 5: Category promotion (Gemma4)
    r = await step_detect_promotions()
    results.append(r)

    logger.info(f"========== Night Batch Done ==========")
    for r in results:
        logger.info(f"  {r}")

    return results
