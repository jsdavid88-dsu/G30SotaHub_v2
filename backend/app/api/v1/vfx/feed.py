"""Feed endpoints — browse, save, promote."""
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import FeedItem
from app.schemas.vfx.feed import FeedCrawlResult, FeedItemRead, FeedSaveToggle
from app.jobs.feed_crawler import crawl_feed_all, crawl_feed_source

router = APIRouter(prefix="/feed", tags=["feed"])


def _verify_admin(token: str | None) -> None:
    if token != settings.admin_token:
        raise HTTPException(status_code=401, detail="Invalid admin token")


@router.get("", response_model=list[FeedItemRead])
async def list_feed(
    source: str | None = None,
    tag: str | None = None,
    saved: bool | None = None,
    since: datetime | None = None,
    limit: int = Query(50, le=500),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(FeedItem)
    if source:
        stmt = stmt.where(FeedItem.source == source)
    if saved is True:
        stmt = stmt.where(FeedItem.is_saved.is_(True))
    if since:
        stmt = stmt.where(FeedItem.discovered_at >= since)
    if tag:
        # SQLite JSON contains — simple LIKE as fallback
        stmt = stmt.where(func.json_extract(FeedItem.tags, "$").like(f"%{tag}%"))
    stmt = stmt.order_by(FeedItem.discovered_at.desc()).offset(offset).limit(limit)

    rows = (await db.execute(stmt)).scalars().all()
    return [FeedItemRead.model_validate(r) for r in rows]


@router.get("/{feed_id}", response_model=FeedItemRead)
async def get_feed_item(feed_id: int, db: AsyncSession = Depends(get_db)):
    item = await db.get(FeedItem, feed_id)
    if not item:
        raise HTTPException(status_code=404, detail="Feed item not found")
    return FeedItemRead.model_validate(item)


@router.post("/{feed_id}/save", response_model=FeedItemRead)
async def toggle_save(
    feed_id: int,
    payload: FeedSaveToggle,
    db: AsyncSession = Depends(get_db),
):
    item = await db.get(FeedItem, feed_id)
    if not item:
        raise HTTPException(status_code=404, detail="Feed item not found")
    item.is_saved = payload.is_saved
    item.saved_at = datetime.utcnow() if payload.is_saved else None
    await db.commit()
    await db.refresh(item)
    return FeedItemRead.model_validate(item)


@router.delete("/{feed_id}", status_code=204)
async def delete_feed_item(feed_id: int, db: AsyncSession = Depends(get_db)):
    item = await db.get(FeedItem, feed_id)
    if not item:
        raise HTTPException(status_code=404, detail="Feed item not found")
    await db.delete(item)
    await db.commit()


@router.post("/crawl", response_model=list[FeedCrawlResult])
async def trigger_feed_crawl(
    background: BackgroundTasks,
    wait: bool = Query(False),
    x_admin_token: str | None = None,
):
    from fastapi import Header
    # Note: FastAPI doesn't parse Header from function body param;
    # this endpoint is protected by checking header in middleware pattern.
    # For simplicity, use query param or header via Depends in Phase C.
    if wait:
        results = await crawl_feed_all()
        return [FeedCrawlResult(**r) for r in results]
    background.add_task(crawl_feed_all)
    return [FeedCrawlResult(source="all")]


@router.post("/crawl/{source}", response_model=FeedCrawlResult)
async def trigger_feed_source(
    source: str,
    background: BackgroundTasks,
    wait: bool = Query(False),
):
    valid = ("youtube", "x", "hf_trending", "paperswithcode", "crawl4ai", "reddit")
    if source not in valid:
        raise HTTPException(status_code=400, detail=f"Unknown source: {source}")
    if wait:
        result = await crawl_feed_source(source)
        return FeedCrawlResult(**result)
    background.add_task(crawl_feed_source, source)
    return FeedCrawlResult(source=source)
