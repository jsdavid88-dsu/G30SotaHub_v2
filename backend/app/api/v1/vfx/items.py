"""Item endpoints."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.constants_vfx import SOURCE_ORDER
from app.database import get_db
from app.models import Category, Item, ItemCategory
from app.schemas.vfx.item import ItemRead
from app.serializers_vfx import serialize_item

router = APIRouter(prefix="/items", tags=["items"])

SORT_MAP = {
    "discovered": Item.discovered_at.desc(),
    "discovered_asc": Item.discovered_at.asc(),
    "published": Item.published_at.desc(),
    "score": Item.llm_score.desc(),
    "keyword_score": Item.keyword_score.desc(),
    "priority": Item.priority.asc(),
}


@router.get("", response_model=list[ItemRead])
async def list_items(
    source: str | None = None,
    priority: str | None = None,
    category: str | None = None,
    since: datetime | None = None,
    min_score: int | None = Query(None, ge=0, le=10),
    sort: str = Query("discovered", pattern="^(discovered|discovered_asc|published|score|keyword_score|priority)$"),
    limit: int = Query(50, le=500),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Item).options(
        selectinload(Item.categories).selectinload(ItemCategory.category)
    )
    if source:
        stmt = stmt.where(Item.source == source)
    if priority:
        stmt = stmt.where(Item.priority == priority)
    if since:
        stmt = stmt.where(Item.discovered_at >= since)
    if min_score is not None:
        stmt = stmt.where(Item.llm_score >= min_score)
    if category:
        stmt = stmt.join(ItemCategory).join(Category).where(Category.slug == category)

    order_by = SORT_MAP.get(sort, Item.discovered_at.desc())
    stmt = stmt.order_by(order_by).offset(offset).limit(limit)
    result = await db.execute(stmt)
    items = result.scalars().unique().all()
    return [serialize_item(i) for i in items]


@router.get("/{item_id}", response_model=ItemRead)
async def get_item(item_id: int, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Item)
        .options(selectinload(Item.categories).selectinload(ItemCategory.category))
        .where(Item.id == item_id)
    )
    result = await db.execute(stmt)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return serialize_item(item)


@router.get("/{item_id}/siblings", response_model=list[ItemRead])
async def get_group_siblings(item_id: int, db: AsyncSession = Depends(get_db)):
    """Return all items sharing the same group_id (excluding self)."""
    anchor = await db.get(Item, item_id)
    if not anchor or not anchor.group_id:
        return []
    stmt = (
        select(Item)
        .options(selectinload(Item.categories).selectinload(ItemCategory.category))
        .where(Item.group_id == anchor.group_id, Item.id != item_id)
    )
    result = await db.execute(stmt)
    siblings = sorted(
        result.scalars().unique().all(),
        key=lambda i: SOURCE_ORDER.get(i.source, 9),
    )
    return [serialize_item(s) for s in siblings]
