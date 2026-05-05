"""Category endpoints."""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Category, Item, ItemCategory
from app.schemas.vfx.category import CategoryRead

router = APIRouter(prefix="/categories", tags=["categories"])


async def _category_stats(db: AsyncSession, cat_id: int) -> tuple[int, int]:
    """Return (total_items, new_this_week) for a category."""
    week_ago = datetime.utcnow() - timedelta(days=7)

    total_q = select(func.count(ItemCategory.item_id)).where(ItemCategory.category_id == cat_id)
    total = (await db.execute(total_q)).scalar() or 0

    new_q = (
        select(func.count(ItemCategory.item_id))
        .join(Item, Item.id == ItemCategory.item_id)
        .where(ItemCategory.category_id == cat_id, Item.discovered_at >= week_ago)
    )
    new_count = (await db.execute(new_q)).scalar() or 0

    return total, new_count


def _to_read(cat: Category, total: int, new_count: int) -> CategoryRead:
    return CategoryRead(
        id=cat.id,
        slug=cat.slug,
        name_ko=cat.name_ko,
        name_en=cat.name_en,
        description=cat.description,
        icon=cat.icon,
        keywords=cat.keywords or [],
        github_topics=cat.github_topics or [],
        hf_tags=cat.hf_tags or [],
        subreddits=cat.subreddits or [],
        x_accounts=cat.x_accounts or [],
        current_sota=cat.current_sota or [],
        display_order=cat.display_order,
        item_count=total,
        new_this_week=new_count,
    )


@router.get("", response_model=list[CategoryRead])
async def list_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Category).order_by(Category.display_order))
    categories = result.scalars().all()

    out = []
    for cat in categories:
        total, new_count = await _category_stats(db, cat.id)
        out.append(_to_read(cat, total, new_count))
    return out


@router.get("/{slug}", response_model=CategoryRead)
async def get_category(slug: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Category).where(Category.slug == slug))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    total, new_count = await _category_stats(db, cat.id)
    return _to_read(cat, total, new_count)
