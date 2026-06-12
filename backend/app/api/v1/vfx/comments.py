"""Comment endpoints — CRUD on items.

이슈 #16: standalone placeholder auth_vfx 제거 → Hub JWT (get_current_user) 사용.
- list: 로그인 필요
- create: 로그인 사용자 (user_id=str(User.id), user_name=User.name)
- delete: 작성자 또는 admin/professor
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import ItemComment as Comment, Item
from app.models.user import User, UserRole
from app.schemas.vfx.comment import CommentCreate, CommentRead

router = APIRouter(prefix="/items/{item_id}/comments", tags=["comments"])


@router.get("", response_model=list[CommentRead])
async def list_comments(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
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
    user: User = Depends(get_current_user),
):
    if not await db.get(Item, item_id):
        raise HTTPException(status_code=404, detail="Item not found")
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Empty content")

    # 컨펌(승인)은 교수·외부연구원·admin 만 — 학생은 일반 댓글만.
    kind = payload.kind if payload.kind in ("comment", "confirm") else "comment"
    if kind == "confirm" and user.role not in (UserRole.admin, UserRole.professor, UserRole.external):
        raise HTTPException(status_code=403, detail="컨펌은 교수/외부연구원만 가능합니다.")

    comment = Comment(
        item_id=item_id,
        user_id=str(user.id),
        user_name=user.name or str(user.email),
        content=content[:4000],
        kind=kind,
        user_role=user.role.value if hasattr(user.role, "value") else str(user.role),
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
    user: User = Depends(get_current_user),
):
    comment = await db.get(Comment, comment_id)
    if not comment or comment.item_id != item_id:
        raise HTTPException(status_code=404, detail="Comment not found")
    # 작성자 본인 또는 admin/professor 만 삭제
    is_owner = comment.user_id == str(user.id)
    is_privileged = user.role in (UserRole.admin, UserRole.professor)
    if not (is_owner or is_privileged):
        raise HTTPException(status_code=403, detail="Not your comment")
    await db.delete(comment)
    await db.commit()
