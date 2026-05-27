"""Search endpoint — full-text across items + categories.

검색 대상 (모두 case-insensitive LIKE):
- Item.title / abstract / authors / external_id / llm_reason
- Item.description (50자 핵심 — Phase 1 통합 신규)
- Item.wiki_body (Karpathy markdown — Phase 1 통합 신규)
- Item.free_tags (JSON array → text cast 후 검색)
- Item 의 매칭된 카테고리 (name_ko / name_en / slug) → 한국어 검색 지원
  → "비디오" → category "비디오 매팅" 매칭 → 그 카테고리 속한 모든 Item
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import String, cast, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Category, Item, ItemCategory
from app.schemas.vfx.item import ItemRead
from app.serializers_vfx import serialize_item

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=list[ItemRead])
async def search_items(
    q: str = Query(..., min_length=1, description="Search term"),
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
):
    """다양한 필드 + 카테고리 매칭 검색.

    예시:
    - "비디오"        → 카테고리 "비디오 매팅" 매칭 → 그 모든 모델
    - "matting"       → title/abstract/카테고리(name_en=Video Matting) 매칭
    - "MatAnyone"     → title/external_id 매칭
    - "head swap"     → title/abstract/카테고리/free_tags 매칭
    """
    like = f"%{q}%"

    # 1) 카테고리 매칭 → 해당 Item id 모음 (subquery)
    matching_category_ids = (
        select(Category.id)
        .where(
            or_(
                Category.name_ko.ilike(like),
                Category.name_en.ilike(like),
                Category.slug.ilike(like),
            )
        )
        .subquery()
    )
    item_ids_via_category = (
        select(ItemCategory.item_id)
        .where(ItemCategory.category_id.in_(select(matching_category_ids)))
        .subquery()
    )

    # 2) 메인 검색 — Item 자체 필드 + 카테고리 매칭 + free_tags
    stmt = (
        select(Item)
        .options(selectinload(Item.categories).selectinload(ItemCategory.category))
        .where(
            or_(
                Item.title.ilike(like),
                Item.abstract.ilike(like),
                Item.authors.ilike(like),
                Item.external_id.ilike(like),
                Item.llm_reason.ilike(like),
                Item.description.ilike(like),
                Item.wiki_body.ilike(like),
                # free_tags 는 JSON array — text cast 후 검색 (단순 LIKE)
                cast(Item.free_tags, String).ilike(like),
                # 카테고리 매칭으로 이 Item 도 결과에 포함
                Item.id.in_(select(item_ids_via_category)),
            )
        )
        .order_by(
            Item.llm_score.desc(),
            Item.keyword_score.desc(),
            Item.discovered_at.desc(),
        )
        .limit(limit)
    )
    result = await db.execute(stmt)
    items = result.scalars().unique().all()
    return [serialize_item(i) for i in items]
