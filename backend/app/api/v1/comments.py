import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.comment import Comment
from app.models.daily import BlockVisibility, DailyBlock, DailyLog
from app.models.user import AdvisorRelation, User, UserRole
from app.schemas.comment import CommentCreate, CommentResponse, CommentUpdate
from app.services.notifications import create_notification
from app.services.mentions import create_mention_notifications
from app.services.web_push import send_push_to_user

router = APIRouter()


def _to_response(comment: Comment, include_replies: bool = True) -> CommentResponse:
    """Convert Comment ORM object to CommentResponse, extracting author_name."""
    replies = []
    if include_replies and hasattr(comment, "replies") and comment.replies:
        replies = [_to_response(r, include_replies=False) for r in comment.replies]

    return CommentResponse(
        id=comment.id,
        daily_block_id=comment.daily_block_id,
        author_id=comment.author_id,
        author_name=comment.author.name,
        content=comment.content,
        parent_id=comment.parent_id,
        image_url=comment.image_url,
        replies=replies,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


@router.get("/daily-blocks/{block_id}/comments", response_model=list[CommentResponse])
async def list_comments(
    block_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List top-level comments for a daily block, with nested replies."""
    # Verify block visibility
    block_result = await db.execute(
        select(DailyBlock)
        .options(selectinload(DailyBlock.daily_log))
        .where(DailyBlock.id == block_id)
    )
    block = block_result.scalar_one_or_none()
    if block is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Block not found")
    if block.daily_log.author_id != current_user.id:
        if block.visibility == BlockVisibility.private:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot access private block")
        if block.visibility == BlockVisibility.advisor:
            adv = await db.execute(
                select(AdvisorRelation).where(
                    AdvisorRelation.professor_id == current_user.id,
                    AdvisorRelation.student_id == block.daily_log.author_id,
                )
            )
            if adv.scalar_one_or_none() is None and current_user.role not in (UserRole.admin,):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot access advisor-only block")

    query = (
        select(Comment)
        .options(
            selectinload(Comment.author),
            selectinload(Comment.replies).selectinload(Comment.author),
        )
        .where(Comment.daily_block_id == block_id, Comment.parent_id.is_(None))
        .order_by(Comment.created_at)
    )
    result = await db.execute(query)
    comments = result.scalars().all()
    return [_to_response(c) for c in comments]


@router.post("/daily-blocks/{block_id}/comments", response_model=CommentResponse, status_code=201)
async def create_comment(
    block_id: uuid.UUID,
    body: CommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a comment to a daily block. Any authenticated user can comment (if visible)."""
    # Verify block visibility before allowing comment
    block_vis_result = await db.execute(
        select(DailyBlock)
        .options(selectinload(DailyBlock.daily_log))
        .where(DailyBlock.id == block_id)
    )
    block_vis = block_vis_result.scalar_one_or_none()
    if block_vis is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Block not found")
    if block_vis.daily_log.author_id != current_user.id:
        if block_vis.visibility == BlockVisibility.private:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot access private block")
        if block_vis.visibility == BlockVisibility.advisor:
            adv = await db.execute(
                select(AdvisorRelation).where(
                    AdvisorRelation.professor_id == current_user.id,
                    AdvisorRelation.student_id == block_vis.daily_log.author_id,
                )
            )
            if adv.scalar_one_or_none() is None and current_user.role not in (UserRole.admin,):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot access advisor-only block")

    # Validate parent_id if provided
    if body.parent_id is not None:
        parent_result = await db.execute(
            select(Comment).where(Comment.id == body.parent_id)
        )
        parent = parent_result.scalar_one_or_none()
        if parent is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Parent comment not found",
            )
        if parent.parent_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot reply to a reply. Only one level of nesting is allowed.",
            )
        if parent.daily_block_id != block_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Parent comment does not belong to this block.",
            )

    comment = Comment(
        daily_block_id=block_id,
        author_id=current_user.id,
        content=body.content,
        parent_id=body.parent_id,
        image_url=body.image_url,
    )
    db.add(comment)

    # Notify the daily block's author (skip if commenter is the author)
    block_result = await db.execute(
        select(DailyBlock)
        .options(selectinload(DailyBlock.daily_log))
        .where(DailyBlock.id == block_id)
    )
    block = block_result.scalar_one_or_none()
    if block and block.daily_log and block.daily_log.author_id != current_user.id:
        await create_notification(
            db,
            user_id=block.daily_log.author_id,
            notification_type="daily_comment",
            title="데일리에 새 댓글이 달렸습니다",
            target_type="daily_block",
            target_id=block_id,
        )

    # @mention 알림 (Phase 1A — 본문에서 @user 파싱)
    await create_mention_notifications(
        db,
        text=body.content,
        actor=current_user,
        source_label="데일리 댓글",
        target_type="daily_block",
        target_id=block_id,
    )

    await db.commit()
    await db.refresh(comment)

    # Send web push to block author (best-effort, after commit)
    if block and block.daily_log and block.daily_log.author_id != current_user.id:
        await send_push_to_user(
            db,
            user_id=block.daily_log.author_id,
            title="데일리에 새 댓글이 달렸습니다",
            body=body.content[:100] if body.content else "",
            url=f"/daily/feed",
            push_type="comment",
        )

    # Re-fetch with author relationship and replies
    result = await db.execute(
        select(Comment)
        .options(
            selectinload(Comment.author),
            selectinload(Comment.replies).selectinload(Comment.author),
        )
        .where(Comment.id == comment.id)
    )
    comment = result.scalar_one()
    return _to_response(comment)


@router.patch("/comments/{comment_id}", response_model=CommentResponse)
async def update_comment(
    comment_id: uuid.UUID,
    body: CommentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit a comment. Only the author can edit their own comment."""
    result = await db.execute(
        select(Comment)
        .options(
            selectinload(Comment.author),
            selectinload(Comment.replies).selectinload(Comment.author),
        )
        .where(Comment.id == comment_id)
    )
    comment = result.scalar_one_or_none()
    if comment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")

    if comment.author_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the author can edit this comment",
        )

    comment.content = body.content
    await db.commit()
    await db.refresh(comment)

    # Re-fetch with author
    result = await db.execute(
        select(Comment)
        .options(
            selectinload(Comment.author),
            selectinload(Comment.replies).selectinload(Comment.author),
        )
        .where(Comment.id == comment.id)
    )
    comment = result.scalar_one()
    return _to_response(comment)


@router.delete("/comments/{comment_id}", status_code=204)
async def delete_comment(
    comment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a comment. Only the author can delete their own comment."""
    result = await db.execute(select(Comment).where(Comment.id == comment_id))
    comment = result.scalar_one_or_none()
    if comment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")

    if comment.author_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the author can delete this comment",
        )

    await db.delete(comment)
    await db.commit()
