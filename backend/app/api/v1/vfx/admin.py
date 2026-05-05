"""Admin endpoints — protected by X-Admin-Token header.

Used by:
- AI Cluster Worker (Phase 3) — pending-scoring / score-update
- Manual ops — crawl trigger, run history
"""
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.models import CrawlRun, Item, ItemCategory
from app.schemas.vfx.admin import CrawlResult, PendingItem, ScoreUpdate, ScoreUpdateResult
from app.jobs.code_linker import link_codes_for_arxiv_items
from app.jobs.crawler import SOURCE_LABELS, crawl_all, crawl_source
from app.jobs.grouper import group_items
from app.jobs.lineage_builder import build_lineage_for_new_items

router = APIRouter(prefix="/admin", tags=["admin"])


def verify_admin_token(x_admin_token: str | None = Header(default=None)) -> None:
    if not x_admin_token or x_admin_token != settings.admin_token:
        raise HTTPException(status_code=401, detail="Invalid admin token")


@router.get("/pending-scoring", response_model=list[PendingItem])
async def pending_scoring(
    limit: int = Query(50, le=200),
    _: None = Depends(verify_admin_token),
    db: AsyncSession = Depends(get_db),
):
    """Items with llm_score=0 waiting for LLM scoring (AI Cluster Worker consumes this)."""
    stmt = (
        select(Item)
        .options(selectinload(Item.categories).selectinload(ItemCategory.category))
        .where(Item.llm_score == 0)
        .order_by(Item.discovered_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    items = result.scalars().unique().all()
    return [
        PendingItem(
            id=i.id,
            source=i.source,
            title=i.title,
            abstract=i.abstract,
            url=i.url,
            category_slugs=[ic.category.slug for ic in i.categories if ic.category],
        )
        for i in items
    ]


@router.post("/score-update", response_model=ScoreUpdateResult)
async def score_update(
    updates: list[ScoreUpdate],
    _: None = Depends(verify_admin_token),
    db: AsyncSession = Depends(get_db),
):
    """Apply LLM scoring results from AI Cluster Worker.

    Rich `analysis` payload (verdict/practical_value/lineage/translation/warning)
    from the Arca persona is stored in item_metadata.arca.
    """
    count = 0
    for u in updates:
        item = await db.get(Item, u.id)
        if not item:
            continue
        item.llm_score = u.llm_score
        if u.llm_reason:
            item.llm_reason = u.llm_reason[:4000]
        if u.priority:
            item.priority = u.priority

        if u.analysis:
            md = dict(item.item_metadata or {})
            md["arca"] = u.analysis
            item.item_metadata = md

        count += 1
    await db.commit()
    return ScoreUpdateResult(updated=count)


@router.post("/crawl/{source}", response_model=CrawlResult)
async def trigger_crawl_source(
    source: str,
    background: BackgroundTasks,
    wait: bool = Query(False, description="wait=true means run synchronously"),
    _: None = Depends(verify_admin_token),
):
    """Trigger a single-source crawl. Default: fire-and-forget."""
    if source not in SOURCE_LABELS:
        raise HTTPException(status_code=400, detail=f"Unknown source: {source}")

    if wait:
        result = await crawl_source(source)
        return CrawlResult(**result)
    else:
        background.add_task(crawl_source, source)
        return CrawlResult(source=source)


@router.post("/crawl")
async def trigger_crawl_all(
    background: BackgroundTasks,
    _: None = Depends(verify_admin_token),
):
    """Trigger all sources (fire-and-forget)."""
    background.add_task(crawl_all)
    return {"status": "started", "sources": SOURCE_LABELS}


@router.post("/link-codes")
async def trigger_link_codes(
    background: BackgroundTasks,
    max_items: int = Query(20, le=100),
    wait: bool = Query(False),
    _: None = Depends(verify_admin_token),
):
    """Scan recent arXiv items and attach matching GitHub repos."""
    if wait:
        total = await link_codes_for_arxiv_items(max_items=max_items)
        return {"status": "done", "links_added": total}
    background.add_task(link_codes_for_arxiv_items, max_items)
    return {"status": "started"}


@router.post("/build-lineage")
async def trigger_build_lineage(
    background: BackgroundTasks,
    max_items: int = Query(20, le=100),
    wait: bool = Query(False),
    _: None = Depends(verify_admin_token),
):
    """Build lineage edges for arXiv items via Semantic Scholar."""
    if wait:
        total = await build_lineage_for_new_items(max_items=max_items)
        return {"status": "done", "edges_added": total}
    background.add_task(build_lineage_for_new_items, max_items)
    return {"status": "started"}


@router.post("/group-items")
async def trigger_group_items(
    background: BackgroundTasks,
    wait: bool = Query(False),
    _: None = Depends(verify_admin_token),
):
    """Run the item grouper to unify same research across sources."""
    if wait:
        result = await group_items()
        return {"status": "done", **result}
    background.add_task(group_items)
    return {"status": "started"}


@router.post("/night-batch")
async def trigger_night_batch(
    background: BackgroundTasks,
    wait: bool = Query(False),
    _: None = Depends(verify_admin_token),
):
    """Run the full night batch pipeline (submissions + grouper + promotions)."""
    from app.jobs.night_batch import run_night_batch

    if wait:
        results = await run_night_batch()
        return {"status": "done", "results": results}
    background.add_task(run_night_batch)
    return {"status": "started"}


@router.get("/runs")
async def list_runs(
    limit: int = Query(20, le=100),
    _: None = Depends(verify_admin_token),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(CrawlRun).order_by(CrawlRun.started_at.desc()).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": r.id,
            "source": r.source,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "finished_at": r.finished_at.isoformat() if r.finished_at else None,
            "items_found": r.items_found,
            "items_new": r.items_new,
            "error": r.error,
        }
        for r in rows
    ]
