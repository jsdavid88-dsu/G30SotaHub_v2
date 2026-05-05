"""Comment endpoints — CRUD on items."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_vfx import CurrentUser, get_current_user
from app.database import get_db
from app.models import ItemComment as Comment, Item
from app.schemas.vfx.comment import CommentCreate, CommentRead

router = APIRouter(prefix="/items/{item_id}/comments", tags=["comments"])


@router.get("", response_model=list[CommentRead])
async def list_comments(item_id: int, db: AsyncSession = Depends(get_db)):
    # Check item exists
    if not await db.get(Item, item_id):
        raise HTTPException(status_code=404, detail="Item not found")

    stmt = select(Comment).where(Comment.item_id == item_id).order_by(Comment.created_at.desc())
    rows = (await db.execute(stmt)).scalars().all()
    return [CommentRead.model_validate(c) for c in rows]


@router.post("", response_model=CommentRead, status_code=201)
async def create_comment(
    item_id: int,
    payload: CommentCreate,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    if not await db.get(Item, item_id):
        raise HTTPException(status_code=404, detail="Item not found")
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Empty content")

    comment = Comment(
        item_id=item_id,
        user_id=user.user_id,
        user_name=user.user_name,
        content=content[:4000],
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return CommentRead.model_validate(comment)


@router.delete("/{comment_id}", status_code=204)
async def delete_comment(
    item_id: int,
    comment_id: int,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    comment = await db.get(Comment, comment_id)
    if not comment or comment.item_id != item_id:
        raise HTTPException(status_code=404, detail="Comment not found")
    # Allow delete if same user or anonymous (standalone mode)
    if user.user_id != "anon" and comment.user_id != user.user_id:
        raise HTTPException(status_code=403, detail="Not your comment")
    await db.delete(comment)
    await db.commit()
