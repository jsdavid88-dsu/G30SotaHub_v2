"""Category endpoints."""
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Category, Item, ItemCategory
from app.models.user import User, UserRole
from app.schemas.vfx.category import CategoryCreate, CategoryRead

router = APIRouter(prefix="/categories", tags=["categories"])


def _require_admin_or_professor(user: User) -> None:
    """카테고리 추가/삭제는 admin 또는 professor 만 가능."""
    if user.role not in (UserRole.admin, UserRole.professor):
        raise HTTPException(status_code=403, detail="Admin/professor 권한 필요")


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


@router.post("", response_model=CategoryRead, status_code=201)
async def create_category(
    payload: CategoryCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """카테고리(분야) 신규 추가 — admin / professor 만."""
    _require_admin_or_professor(user)

    # slug 중복 검사
    existing = await db.execute(select(Category).where(Category.slug == payload.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"slug '{payload.slug}' 이미 존재")

    cat = Category(**payload.model_dump())
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return _to_read(cat, 0, 0)


@router.delete("/{slug}", status_code=204)
async def delete_category(
    slug: str,
    user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """카테고리 삭제 — admin / professor 만. item_categories 도 cascade 처리."""
    _require_admin_or_professor(user)

    result = await db.execute(select(Category).where(Category.slug == slug))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    # 해당 카테고리에 묶인 item_categories 매핑 먼저 삭제
    await db.execute(
        ItemCategory.__table__.delete().where(ItemCategory.category_id == cat.id)
    )
    await db.delete(cat)
    await db.commit()
    return None
