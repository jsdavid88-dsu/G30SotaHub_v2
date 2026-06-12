import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.daily import (
    BlockVisibility,
    DailyBlock,
    DailyBlockTag,
    DailyLog,
)
from app.models.tag import Tag
from app.models.project import ProjectMember
from app.models.user import AdvisorRelation, User, UserRole
from app.schemas.daily import (
    DailyBlockCreate,
    DailyBlockResponse,
    DailyBlockUpdate,
    DailyFeedResponse,
    DailyLogCreate,
    DailyLogResponse,
    DailyLogUpdate,
    DailyLogWithAuthorResponse,
)

router = APIRouter()
block_router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _block_load_options():
    """Standard selectinload options for blocks and their tags."""
    return selectinload(DailyLog.blocks).selectinload(DailyBlock.tags).selectinload(DailyBlockTag.tag)


async def _get_log_or_404(
    db: AsyncSession, log_id: uuid.UUID
) -> DailyLog:
    result = await db.execute(
        select(DailyLog)
        .options(
            selectinload(DailyLog.author),
            _block_load_options(),
        )
        .where(DailyLog.id == log_id)
    )
    log = result.scalar_one_or_none()
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Daily log not found")
    return log


async def _check_author(log: DailyLog, user: User) -> None:
    if log.author_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the author can modify this daily log",
        )


async def _filter_blocks_by_visibility(
    db: AsyncSession,
    log: DailyLog,
    viewer: User,
) -> list:
    """Filter blocks according to visibility rules relative to the viewer."""
    if log.author_id == viewer.id:
        return log.blocks

    visible: list = []
    # Cache advisor check
    is_advisor: bool | None = None
    # Cache project membership
    project_memberships: set[uuid.UUID] | None = None

    for block in log.blocks:
        if block.visibility == BlockVisibility.private:
            continue

        if block.visibility == BlockVisibility.advisor:
            if is_advisor is None:
                result = await db.execute(
                    select(AdvisorRelation).where(
                        AdvisorRelation.professor_id == viewer.id,
                        AdvisorRelation.student_id == log.author_id,
                    )
                )
                is_advisor = result.scalar_one_or_none() is not None
            if not is_advisor:
                continue

        if block.visibility == BlockVisibility.internal:
            if viewer.role == UserRole.external:
                continue

        if block.visibility == BlockVisibility.project:
            if project_memberships is None:
                result = await db.execute(
                    select(ProjectMember.project_id).where(
                        ProjectMember.user_id == viewer.id
                    )
                )
                project_memberships = {row[0] for row in result.all()}
            if block.project_id not in project_memberships:
                continue

        visible.append(block)

    return visible


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/stats")
async def daily_submission_stats(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
    date_val: date = Query(None, alias="date"),
):
    """Return daily submission stats: total students, submitted, not submitted.

    If no date is provided, defaults to today.
    """
    from datetime import date as date_type

    target_date = date_val if date_val is not None else date_type.today()

    # Count total active students
    total_result = await db.execute(
        select(func.count()).select_from(
            select(User.id).where(
                User.role == UserRole.student,
            ).subquery()
        )
    )
    total_students = total_result.scalar() or 0

    # Count students who submitted on the target date
    submitted_result = await db.execute(
        select(func.count(func.distinct(DailyLog.author_id))).where(
            DailyLog.date == target_date,
        )
    )
    submitted = submitted_result.scalar() or 0

    return {
        "date": str(target_date),
        "total_students": total_students,
        "submitted": submitted,
        "not_submitted": total_students - submitted,
    }


@router.get("/")
async def list_daily_logs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    author_id: uuid.UUID | None = Query(None),
    project_id: uuid.UUID | None = Query(None),
    q: str | None = Query(None, description="Keyword search across block content"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    """List daily logs with filtering, keyword search, and pagination."""
    query = select(DailyLog).options(
        selectinload(DailyLog.author),
        _block_load_options(),
    )

    # Professor: only show logs from their advisees (unless explicit author_id filter)
    if current_user.role == UserRole.professor and author_id is None:
        advisee_ids_q = select(AdvisorRelation.student_id).where(
            AdvisorRelation.professor_id == current_user.id
        )
        query = query.where(DailyLog.author_id.in_(advisee_ids_q))

    if date_from is not None:
        query = query.where(DailyLog.date >= date_from)
    if date_to is not None:
        query = query.where(DailyLog.date <= date_to)
    if author_id is not None:
        query = query.where(DailyLog.author_id == author_id)
    if project_id is not None:
        # Join blocks to filter by project
        query = query.where(
            DailyLog.id.in_(
                select(DailyBlock.daily_log_id).where(DailyBlock.project_id == project_id)
            )
        )
    if q:
        # Full-text search on block content via search_vector (TSVECTOR + GIN)
        # Falls back to ILIKE if search_vector is empty (e.g. before backfill)
        query = query.where(
            DailyLog.id.in_(
                select(DailyBlock.daily_log_id).where(
                    DailyBlock.search_vector.op("@@")(
                        func.plainto_tsquery("simple", q)
                    )
                    | DailyBlock.content.ilike(f"%{q}%")
                )
            )
        )

    # Total count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Paginated results
    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit).order_by(DailyLog.date.desc(), DailyLog.created_at.desc())
    result = await db.execute(query)
    logs = result.scalars().unique().all()

    # Filter blocks by visibility for each log
    response_logs = []
    for log in logs:
        filtered_blocks = await _filter_blocks_by_visibility(db, log, current_user)
        log_data = DailyLogWithAuthorResponse.model_validate(log)
        log_data.blocks = [DailyBlockResponse.model_validate(b) for b in filtered_blocks]
        response_logs.append(log_data)

    return DailyFeedResponse(
        data=response_logs,
        meta={"page": page, "limit": limit, "total": total},
    )


@router.post("/", response_model=DailyLogResponse, status_code=201)
async def create_daily_log(
    body: DailyLogCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.student, UserRole.professor, UserRole.admin)),
):
    """Create a daily log. 학생/교수/admin 모두 본인 데일리 작성 가능 (external 제외)."""
    # Check for duplicate date
    existing = await db.execute(
        select(DailyLog).where(
            DailyLog.author_id == current_user.id,
            DailyLog.date == body.date,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A daily log already exists for this date",
        )

    log = DailyLog(
        author_id=current_user.id,
        date=body.date,
        raw_content=body.raw_content,
    )
    db.add(log)
    await db.commit()

    # Re-fetch with relationships
    return await _get_log_or_404(db, log.id)


@router.get("/{log_id}", response_model=DailyLogResponse)
async def get_daily_log(
    log_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get daily log detail with blocks, filtered by visibility."""
    log = await _get_log_or_404(db, log_id)

    filtered_blocks = await _filter_blocks_by_visibility(db, log, current_user)
    response = DailyLogResponse.model_validate(log)
    response.blocks = [DailyBlockResponse.model_validate(b) for b in filtered_blocks]
    return response


@router.patch("/{log_id}", response_model=DailyLogResponse)
async def update_daily_log(
    log_id: uuid.UUID,
    body: DailyLogUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update raw_content of a daily log. Author only."""
    log = await _get_log_or_404(db, log_id)
    await _check_author(log, current_user)

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(log, field, value)

    await db.commit()
    await db.refresh(log)
    return await _get_log_or_404(db, log.id)


@router.post("/{log_id}/blocks", response_model=list[DailyBlockResponse], status_code=201)
async def create_blocks(
    log_id: uuid.UUID,
    body: list[DailyBlockCreate],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create or replace blocks for a daily log. Author only."""
    log = await _get_log_or_404(db, log_id)
    await _check_author(log, current_user)

    # Validate project visibility constraint
    for block_data in body:
        if block_data.visibility == BlockVisibility.project and block_data.project_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="project_id is required when visibility is 'project'",
            )

    # Delete existing blocks
    existing = await db.execute(
        select(DailyBlock).where(DailyBlock.daily_log_id == log_id)
    )
    for old_block in existing.scalars().all():
        await db.delete(old_block)
    await db.flush()

    # Create new blocks
    created = []
    for block_data in body:
        block = DailyBlock(
            daily_log_id=log_id,
            content=block_data.content,
            block_order=block_data.block_order,
            section=block_data.section,
            project_id=block_data.project_id,
            task_id=block_data.task_id,
            visibility=block_data.visibility,
        )
        db.add(block)
        created.append(block)

    await db.commit()

    # Re-fetch with tags
    result = await db.execute(
        select(DailyBlock)
        .options(selectinload(DailyBlock.tags).selectinload(DailyBlockTag.tag))
        .where(DailyBlock.daily_log_id == log_id)
        .order_by(DailyBlock.block_order)
    )
    blocks = result.scalars().all()
    return [DailyBlockResponse.model_validate(b) for b in blocks]


@block_router.patch("/{block_id}", response_model=DailyBlockResponse)
async def update_block(
    block_id: uuid.UUID,
    body: DailyBlockUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a single block. Author of the parent daily log only."""
    result = await db.execute(
        select(DailyBlock)
        .options(selectinload(DailyBlock.tags).selectinload(DailyBlockTag.tag))
        .where(DailyBlock.id == block_id)
    )
    block = result.scalar_one_or_none()
    if block is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Block not found")

    # Check ownership via parent log
    log_result = await db.execute(select(DailyLog).where(DailyLog.id == block.daily_log_id))
    log = log_result.scalar_one()
    await _check_author(log, current_user)

    update_data = body.model_dump(exclude_unset=True)

    # Validate project visibility constraint
    new_visibility = update_data.get("visibility", block.visibility)
    new_project_id = update_data.get("project_id", block.project_id)
    if new_visibility == BlockVisibility.project and new_project_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="project_id is required when visibility is 'project'",
        )

    for field, value in update_data.items():
        setattr(block, field, value)

    await db.commit()
    await db.refresh(block)

    # Re-fetch with tags
    result = await db.execute(
        select(DailyBlock)
        .options(selectinload(DailyBlock.tags).selectinload(DailyBlockTag.tag))
        .where(DailyBlock.id == block_id)
    )
    block = result.scalar_one()
    return DailyBlockResponse.model_validate(block)


@block_router.delete("/{block_id}", status_code=204)
async def delete_block(
    block_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a single block. Author of the parent daily log only."""
    result = await db.execute(select(DailyBlock).where(DailyBlock.id == block_id))
    block = result.scalar_one_or_none()
    if block is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Block not found")

    # Check ownership via parent log
    log_result = await db.execute(select(DailyLog).where(DailyLog.id == block.daily_log_id))
    log = log_result.scalar_one()
    await _check_author(log, current_user)

    await db.delete(block)
    await db.commit()


@block_router.post("/{block_id}/tags", status_code=201)
async def add_tag_to_block(
    block_id: uuid.UUID,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a tag to a block. Accepts {tag_id: uuid}. Author only."""
    tag_id = body.get("tag_id")
    if not tag_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="tag_id is required")

    result = await db.execute(select(DailyBlock).where(DailyBlock.id == block_id))
    block = result.scalar_one_or_none()
    if block is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Block not found")

    log_result = await db.execute(select(DailyLog).where(DailyLog.id == block.daily_log_id))
    log = log_result.scalar_one()
    await _check_author(log, current_user)

    # Check tag exists
    tag_result = await db.execute(select(Tag).where(Tag.id == uuid.UUID(str(tag_id))))
    if tag_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")

    # Check duplicate
    existing = await db.execute(
        select(DailyBlockTag).where(
            DailyBlockTag.daily_block_id == block_id,
            DailyBlockTag.tag_id == uuid.UUID(str(tag_id)),
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tag already attached")

    block_tag = DailyBlockTag(daily_block_id=block_id, tag_id=uuid.UUID(str(tag_id)))
    db.add(block_tag)
    await db.commit()
    await db.refresh(block_tag)

    return {"id": str(block_tag.id), "tag_id": str(tag_id)}


@block_router.delete("/{block_id}/tags/{tag_id}", status_code=204)
async def remove_tag_from_block(
    block_id: uuid.UUID,
    tag_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a tag from a block. Author only."""
    result = await db.execute(select(DailyBlock).where(DailyBlock.id == block_id))
    block = result.scalar_one_or_none()
    if block is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Block not found")

    log_result = await db.execute(select(DailyLog).where(DailyLog.id == block.daily_log_id))
    log = log_result.scalar_one()
    await _check_author(log, current_user)

    bt_result = await db.execute(
        select(DailyBlockTag).where(
            DailyBlockTag.daily_block_id == block_id,
            DailyBlockTag.tag_id == tag_id,
        )
    )
    bt = bt_result.scalar_one_or_none()
    if bt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Block-tag link not found")

    await db.delete(bt)
    await db.commit()
