"""Submission endpoints — anyone can submit URLs/keywords for Arca to investigate."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Submission
from app.schemas.vfx.submission import SubmissionCreate, SubmissionRead

router = APIRouter(prefix="/submissions", tags=["submissions"])

# Simple rate limit: max pending submissions per "user" (or anonymous)
MAX_PENDING_PER_USER = 20


@router.post("", response_model=SubmissionRead, status_code=201)
async def create_submission(
    body: SubmissionCreate,
    db: AsyncSession = Depends(get_db),
):
    """Submit a URL or keyword for Arca to investigate."""
    # Rate limit check
    user_key = body.submitted_by or "__anonymous__"
    pending_count = (
        await db.execute(
            select(func.count(Submission.id)).where(
                Submission.submitted_by == (body.submitted_by or None),
                Submission.status == "pending",
            )
        )
    ).scalar() or 0

    if pending_count >= MAX_PENDING_PER_USER:
        raise HTTPException(
            status_code=429,
            detail=f"대기 중인 제보가 {MAX_PENDING_PER_USER}개 이상입니다. 처리 후 다시 시도하세요.",
        )

    sub = Submission(
        submitted_by=body.submitted_by or None,
        input_type=body.input_type,
        input_value=body.input_value.strip(),
        status="pending",
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return sub


@router.get("", response_model=list[SubmissionRead])
async def list_submissions(
    status: str | None = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """List submissions, optionally filtered by status."""
    stmt = select(Submission).order_by(Submission.created_at.desc())
    if status:
        stmt = stmt.where(Submission.status == status)
    stmt = stmt.offset(offset).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/stats")
async def submission_stats(db: AsyncSession = Depends(get_db)):
    """Quick stats on submission queue."""
    counts = {}
    for s in ("pending", "processing", "done", "rejected"):
        q = select(func.count(Submission.id)).where(Submission.status == s)
        counts[s] = (await db.execute(q)).scalar() or 0
    return counts
