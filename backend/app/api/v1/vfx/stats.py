"""Stats endpoints for dashboard summary."""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import CrawlRun, Item
from app.schemas.vfx.stats import DashboardSummary

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/summary", response_model=DashboardSummary)
async def dashboard_summary(db: AsyncSession = Depends(get_db)):
    week_ago = datetime.utcnow() - timedelta(days=7)

    total = (await db.execute(select(func.count(Item.id)))).scalar() or 0
    new_week = (await db.execute(select(func.count(Item.id)).where(Item.discovered_at >= week_ago))).scalar() or 0
    p0 = (await db.execute(select(func.count(Item.id)).where(Item.priority == "P0"))).scalar() or 0
    p1 = (await db.execute(select(func.count(Item.id)).where(Item.priority == "P1"))).scalar() or 0

    last_crawl_q = select(CrawlRun).order_by(CrawlRun.started_at.desc()).limit(1)
    last_crawl_row = (await db.execute(last_crawl_q)).scalar_one_or_none()
    last_crawl = last_crawl_row.started_at.isoformat() if last_crawl_row else None

    return DashboardSummary(
        total_items=total,
        new_this_week=new_week,
        p0_count=p0,
        p1_count=p1,
        categories_with_updates=0,  # TODO Phase 2
        last_crawl=last_crawl,
    )
