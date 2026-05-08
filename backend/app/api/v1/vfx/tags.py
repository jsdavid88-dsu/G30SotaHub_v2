"""Tag aggregation + category suggestion endpoints."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import CategorySuggestion, Item

router = APIRouter(prefix="/tags", tags=["tags"])

# Minimum items with same tag before suggesting a new category
PROMOTION_THRESHOLD = 5


@router.get("/counts")
async def tag_counts(
    min_count: int = Query(1, ge=1),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate free_tags across all items. Returns [{tag, count}] sorted by count desc."""
    # PostgreSQL JSON: free_tags is a JSON array like ["comfyui", "workflow"]
    # jsonb_array_elements_text 로 unnest (SQLite 의 json_each 가 PG 에서는 object 만 받음)
    stmt = text("""
        SELECT tag, COUNT(*) AS cnt
        FROM items, jsonb_array_elements_text(items.free_tags::jsonb) AS tag
        GROUP BY tag
        HAVING COUNT(*) >= :min_count
        ORDER BY cnt DESC
    """)
    rows = (await db.execute(stmt, {"min_count": min_count})).fetchall()
    return [{"tag": r[0], "count": r[1]} for r in rows]


@router.get("/suggestions")
async def list_suggestions(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List category suggestions."""
    stmt = select(CategorySuggestion).order_by(CategorySuggestion.item_count.desc())
    if status:
        stmt = stmt.where(CategorySuggestion.status == status)
    rows = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": s.id,
            "tag": s.tag,
            "item_count": s.item_count,
            "suggested_name_ko": s.suggested_name_ko,
            "suggested_name_en": s.suggested_name_en,
            "suggested_keywords": s.suggested_keywords,
            "arca_reason": s.arca_reason,
            "status": s.status,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in rows
    ]


@router.post("/suggestions/{suggestion_id}/approve")
async def approve_suggestion(
    suggestion_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Approve a category suggestion — creates the category."""
    from app.models import Category

    sug = await db.get(CategorySuggestion, suggestion_id)
    if not sug:
        raise HTTPException(404, "Suggestion not found")
    if sug.status != "pending":
        raise HTTPException(400, f"Suggestion already {sug.status}")

    # Create the category
    slug = sug.tag.replace(" ", "_").replace("-", "_").lower()
    existing = (
        await db.execute(select(Category).where(Category.slug == slug))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(400, f"Category '{slug}' already exists")

    max_order = (await db.execute(select(func.max(Category.display_order)))).scalar() or 0
    new_cat = Category(
        slug=slug,
        name_ko=sug.suggested_name_ko or sug.tag,
        name_en=sug.suggested_name_en or sug.tag,
        keywords=sug.suggested_keywords or [sug.tag],
        display_order=max_order + 1,
    )
    db.add(new_cat)

    sug.status = "approved"
    sug.decided_at = datetime.now(timezone.utc)

    await db.commit()
    return {"status": "approved", "slug": slug}


@router.post("/suggestions/{suggestion_id}/reject")
async def reject_suggestion(
    suggestion_id: int,
    reason: str = Query(""),
    db: AsyncSession = Depends(get_db),
):
    """Reject a category suggestion."""
    sug = await db.get(CategorySuggestion, suggestion_id)
    if not sug:
        raise HTTPException(404, "Suggestion not found")

    sug.status = "rejected"
    sug.decided_at = datetime.now(timezone.utc)
    if reason:
        sug.arca_reason = (sug.arca_reason or "") + f"\n[거절 사유] {reason}"

    await db.commit()
    return {"status": "rejected"}
