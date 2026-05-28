"""SOTA endpoints — Phase 1 통합 후 (2026-05-07).

Hub /sota 페이지가 사용하는 엔드포인트.
- 통합 모델 Item (table: items, int PK) 을 표현
- 자동 수집된 모델 + 수동 등록(source='manual') 모두 동일 API
- SotaAssignment / SotaReview 는 그대로 유지 (sota_item_id: int FK)
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.sota import SotaAssignment, SotaAssignmentStatus, SotaReview
from app.models.user import User, UserRole
from app.models.vfx_item import Item, ItemCategory, LifecycleStatus
from app.schemas.sota import (
    SotaAssignmentCreate,
    SotaAssignmentResponse,
    SotaAssignmentUpdate,
    SotaItemCreate,
    SotaItemDetail,
    SotaItemResponse,
    SotaItemUpdate,
    SotaReviewCreate,
    SotaReviewResponse,
)

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────


def _load_item_with_assignments():
    return [
        selectinload(Item.assignments).options(
            selectinload(SotaAssignment.assignee),
            selectinload(SotaAssignment.reviews).selectinload(SotaReview.reviewer),
        ),
        selectinload(Item.categories).selectinload(ItemCategory.category),
    ]


async def _get_item_or_404(db: AsyncSession, item_id: int) -> Item:
    stmt = select(Item).options(*_load_item_with_assignments()).where(Item.id == item_id)
    result = await db.execute(stmt)
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SOTA item not found")
    return item


async def _get_assignment_or_404(db: AsyncSession, assignment_id: uuid.UUID) -> SotaAssignment:
    result = await db.execute(
        select(SotaAssignment)
        .options(
            selectinload(SotaAssignment.assignee),
            selectinload(SotaAssignment.reviews).selectinload(SotaReview.reviewer),
            selectinload(SotaAssignment.item),  # nested item 필드 응답용
        )
        .where(SotaAssignment.id == assignment_id)
    )
    assignment = result.scalar_one_or_none()
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    return assignment


def _build_item_response(item: Item) -> SotaItemResponse:
    """Item 모델 → SotaItemResponse 매핑.

    Hub /sota 페이지 호환을 위해 abstract 를 summary 필드로 노출.
    discovered_at 을 created_at 으로 매핑 (Hub 기존 응답 호환).
    """
    cat_slugs: list[str] = []
    if item.categories:
        for ic in item.categories:
            if ic.category and getattr(ic.category, "slug", None):
                cat_slugs.append(ic.category.slug)

    return SotaItemResponse(
        id=item.id,
        title=item.title,
        source=item.source,
        external_id=item.external_id,
        url=item.url,
        summary=item.abstract,
        published_at=item.published_at,
        discovered_at=item.discovered_at,
        created_at=item.discovered_at,
        assignments_count=len(item.assignments) if item.assignments else 0,
        description=item.description,
        wiki_body=item.wiki_body,
        confidence_status=item.confidence_status,
        version=item.version,
        refs=item.refs or {},
        lifecycle_status=item.lifecycle_status,
        replaced_by_id=item.replaced_by_id,
        deprecated_at=item.deprecated_at,
        project_id=item.project_id,
        keyword_score=item.keyword_score,
        llm_score=item.llm_score,
        llm_reason=item.llm_reason,
        priority=item.priority,
        free_tags=item.free_tags or [],
        category_slugs=cat_slugs,
        item_metadata=item.item_metadata or {},
    )


def _build_review_response(review: SotaReview) -> SotaReviewResponse:
    return SotaReviewResponse(
        id=review.id,
        sota_assignment_id=review.sota_assignment_id,
        reviewer_id=review.reviewer_id,
        reviewer_name=review.reviewer.name if review.reviewer else "",
        content=review.content,
        submitted_at=review.submitted_at,
        created_at=review.created_at,
    )


def _build_assignment_response(assignment: SotaAssignment) -> SotaAssignmentResponse:
    # selectinload 로 미리 로드된 item 정보를 nested 로 펴서 전달 (N+1 회피)
    item = getattr(assignment, "item", None)
    item_lifecycle = None
    if item and getattr(item, "lifecycle_status", None):
        lc = item.lifecycle_status
        item_lifecycle = lc.value if hasattr(lc, "value") else str(lc)
    return SotaAssignmentResponse(
        id=assignment.id,
        sota_item_id=assignment.sota_item_id,
        assignee_id=assignment.assignee_id,
        assignee_name=assignment.assignee.name if assignment.assignee else "",
        assigned_by=assignment.assigned_by,
        status=assignment.status,
        due_date=assignment.due_date,
        created_at=assignment.created_at,
        reviews=[_build_review_response(r) for r in (assignment.reviews or [])],
        item_title=item.title if item else None,
        item_source=item.source if item else None,
        item_url=item.url if item else None,
        item_lifecycle_status=item_lifecycle,
        item_priority=item.priority if item else None,
    )


def _build_item_detail(item: Item) -> SotaItemDetail:
    base = _build_item_response(item)
    return SotaItemDetail(
        **base.model_dump(),
        assignments=[_build_assignment_response(a) for a in (item.assignments or [])],
    )


# ── SOTA Item Endpoints ──────────────────────────────────────────────────


@router.get("/", response_model=list[SotaItemResponse])
async def list_sota_items(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
    search: str | None = Query(None),
    assignment_status: SotaAssignmentStatus | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    """List SOTA items with optional search and assignment-status filter.

    자동 수집(arxiv/github/...) + 수동 등록(manual) 모두 포함.
    """
    query = select(Item).options(*_load_item_with_assignments())

    if search:
        like = f"%{search}%"
        query = query.where(
            Item.title.ilike(like)
            | Item.source.ilike(like)
            | Item.abstract.ilike(like)
            | Item.description.ilike(like)
        )

    if assignment_status is not None:
        query = query.where(
            Item.id.in_(
                select(SotaAssignment.sota_item_id).where(
                    SotaAssignment.status == assignment_status
                )
            )
        )

    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit).order_by(Item.discovered_at.desc())
    result = await db.execute(query)
    items = result.scalars().unique().all()

    return [_build_item_response(item) for item in items]


@router.get("/my", response_model=list[SotaAssignmentResponse])
async def list_my_assignments(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    assignment_status: SotaAssignmentStatus | None = Query(None, alias="status"),
):
    """List SOTA assignments for the current user (student view)."""
    query = (
        select(SotaAssignment)
        .options(
            selectinload(SotaAssignment.assignee),
            selectinload(SotaAssignment.reviews).selectinload(SotaReview.reviewer),
            selectinload(SotaAssignment.item),
        )
        .where(SotaAssignment.assignee_id == current_user.id)
    )

    if assignment_status is not None:
        query = query.where(SotaAssignment.status == assignment_status)

    query = query.order_by(SotaAssignment.created_at.desc())
    result = await db.execute(query)
    assignments = result.scalars().unique().all()

    return [_build_assignment_response(a) for a in assignments]


@router.get("/{item_id}", response_model=SotaItemDetail)
async def get_sota_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Get SOTA item detail with assignments and reviews."""
    item = await _get_item_or_404(db, item_id)
    return _build_item_detail(item)


@router.post("/", response_model=SotaItemResponse, status_code=201)
async def create_sota_item(
    body: SotaItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.professor, UserRole.admin)),
):
    """Create a new SOTA item via Hub UI (manual).

    source 'manual' 로 저장됨 — 자동 크롤된 항목과 구분.
    external_id 는 자동 생성 (manual_<uuid>).
    """
    item = Item(
        source="manual",
        external_id=f"manual_{uuid.uuid4().hex[:16]}",
        title=body.title,
        abstract=body.summary,
        url=body.url,
        published_at=body.published_at,
        item_metadata={"learned_source_label": body.source} if body.source else {},
        lifecycle_status=LifecycleStatus.research,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)

    return SotaItemResponse(
        id=item.id,
        title=item.title,
        source=item.source,
        external_id=item.external_id,
        url=item.url,
        summary=item.abstract,
        published_at=item.published_at,
        discovered_at=item.discovered_at,
        created_at=item.discovered_at,
        assignments_count=0,
        lifecycle_status=item.lifecycle_status,
        confidence_status=item.confidence_status,
        version=item.version,
        refs={},
        free_tags=[],
        category_slugs=[],
        item_metadata=item.item_metadata or {},
    )


@router.patch("/{item_id}", response_model=SotaItemResponse)
async def update_sota_item(
    item_id: int,
    body: SotaItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.professor, UserRole.admin)),
):
    """Update a SOTA item."""
    item = await _get_item_or_404(db, item_id)

    update_data = body.model_dump(exclude_unset=True)
    # summary → abstract alias
    if "summary" in update_data:
        item.abstract = update_data.pop("summary")
    # source 'manual' 외에 학회/저널 라벨은 metadata 에 저장
    if item.source == "manual" and "source" in update_data:
        new_label = update_data.pop("source")
        md = dict(item.item_metadata or {})
        if new_label:
            md["learned_source_label"] = new_label
        item.item_metadata = md

    for field, value in update_data.items():
        if hasattr(item, field):
            setattr(item, field, value)

    item.version = (item.version or 1) + 1
    await db.commit()

    item = await _get_item_or_404(db, item_id)
    return _build_item_response(item)


@router.delete("/{item_id}", status_code=204)
async def delete_sota_item(
    item_id: int,
    hard: bool = Query(False, description="manual 외의 source 도 hard delete (admin 명시적 옵션, 위험)"),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_role(UserRole.professor, UserRole.admin)),
):
    """Delete or archive a SOTA item. Professor or admin only.

    이슈 #15 P1-4: 자동 수집된 (source != 'manual') 모델은 hard delete 시
    assignments/comments/categories 가 cascade 로 통째 날아가므로 위험.

    동작:
    - source == 'manual': hard delete (사용자 수동 등록 — 원복 가능, 안전)
    - source != 'manual': soft archive (status='archived', lifecycle_status='deprecated',
      deprecated_at=now, deprecated_reason='Soft-deleted by admin')
    - ?hard=true 쿼리스트링 명시 시 모든 source hard delete (admin 의식적 선택)
    """
    item = await _get_item_or_404(db, item_id)

    if hard or item.source == "manual":
        # manual 또는 hard=true 명시 → 실제 삭제 (cascade 적용)
        await db.delete(item)
        await db.commit()
        return

    # soft archive — 자동 수집된 모델은 기록 보존
    item.status = "archived"
    item.lifecycle_status = LifecycleStatus.deprecated
    item.deprecated_at = datetime.now(timezone.utc)
    if not item.deprecated_reason:
        item.deprecated_reason = "Soft-deleted by admin"
    await db.commit()


# ── Assignment Endpoints ──────────────────────────────────────────────────


@router.post("/{item_id}/assign", response_model=SotaAssignmentResponse, status_code=201)
async def assign_sota_item(
    item_id: int,
    body: SotaAssignmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.professor, UserRole.admin)),
):
    """Assign a SOTA item to a student. Professor or admin only.

    자동 수집된 모델도 학생/외부 협력자에게 배정 가능.
    """
    await _get_item_or_404(db, item_id)

    result = await db.execute(select(User).where(User.id == body.assignee_id))
    assignee = result.scalar_one_or_none()
    if assignee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Check duplicate assignment
    result = await db.execute(
        select(SotaAssignment).where(
            SotaAssignment.sota_item_id == item_id,
            SotaAssignment.assignee_id == body.assignee_id,
        )
    )
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 해당 학생에게 배정된 논문입니다",
        )

    assignment = SotaAssignment(
        sota_item_id=item_id,
        assignee_id=body.assignee_id,
        assigned_by=current_user.id,
        due_date=body.due_date,
        status=SotaAssignmentStatus.assigned,
    )
    db.add(assignment)
    await db.commit()

    assignment = await _get_assignment_or_404(db, assignment.id)
    return _build_assignment_response(assignment)


@router.patch("/assignments/{assignment_id}", response_model=SotaAssignmentResponse)
async def update_assignment(
    assignment_id: uuid.UUID,
    body: SotaAssignmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update assignment status or due date."""
    assignment = await _get_assignment_or_404(db, assignment_id)

    if current_user.role not in (UserRole.professor, UserRole.admin):
        if assignment.assignee_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the assignee or professor/admin can update this assignment",
            )

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(assignment, field, value)

    await db.commit()

    assignment = await _get_assignment_or_404(db, assignment_id)
    return _build_assignment_response(assignment)


# ── Review Endpoints ──────────────────────────────────────────────────────


@router.post("/assignments/{assignment_id}/review", response_model=SotaReviewResponse, status_code=201)
async def submit_review(
    assignment_id: uuid.UUID,
    body: SotaReviewCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit a review for a SOTA assignment."""
    assignment = await _get_assignment_or_404(db, assignment_id)

    if current_user.role not in (UserRole.professor, UserRole.admin):
        if assignment.assignee_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the assignee or professor/admin can submit a review for this assignment",
            )

    review = SotaReview(
        sota_assignment_id=assignment_id,
        reviewer_id=current_user.id,
        content=body.content,
        submitted_at=datetime.now(timezone.utc),
    )
    db.add(review)

    if assignment.status in (SotaAssignmentStatus.assigned, SotaAssignmentStatus.in_review):
        assignment.status = SotaAssignmentStatus.submitted

    await db.commit()
    await db.refresh(review)

    result = await db.execute(
        select(SotaReview)
        .options(selectinload(SotaReview.reviewer))
        .where(SotaReview.id == review.id)
    )
    review = result.scalar_one()
    return _build_review_response(review)


# ── LLM Placeholder ──────────────────────────────────────────────────────


@router.get("/{item_id}/analyze")
async def analyze_sota_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Placeholder for future LLM paper analysis."""
    await _get_item_or_404(db, item_id)
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="LLM 분석 기능은 준비 중입니다 (야간 배치에서 자동 실행)",
    )
