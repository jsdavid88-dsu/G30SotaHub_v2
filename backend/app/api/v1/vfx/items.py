"""Item endpoints — Phase 1 통합 후 (2026-05-07).

ItemRead 응답에 assignments (Hub 학생 배정 정보) 자동 eager-load.
Triage 워크플로우 (2026-05-07): PATCH /items/{id} + POST /items/{id}/triage.
"""
from datetime import date, datetime
from typing import Literal
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.constants_vfx import SOURCE_ORDER
from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models import Category, Item, ItemCategory, User, UserRole
from app.models.sota import SotaAssignment, SotaAssignmentStatus, SotaReview
from app.models.vfx_item import LifecycleStatus
from app.schemas.vfx.item import ItemRead
from app.serializers_vfx import serialize_item

router = APIRouter(prefix="/items", tags=["items"])


# ── Workflow status — Triage 액션 결과 저장용 ─────────────────────────────
# Item.status 는 String 컬럼 (마이그레이션 변경 X) — 아래 값들 사용 약속.
WORKFLOW_STATUSES = {"new", "triaged", "holding", "skipped", "archived"}


SORT_MAP = {
    "discovered": Item.discovered_at.desc(),
    "discovered_asc": Item.discovered_at.asc(),
    "published": Item.published_at.desc().nullslast(),
    "published_asc": Item.published_at.asc().nullsfirst(),
    "score": Item.llm_score.desc(),
    "keyword_score": Item.keyword_score.desc(),
    "priority": Item.priority.asc(),
}


def _eager_options():
    """카테고리 + 학생 배정 + 리뷰까지 한 번에 eager load."""
    return [
        selectinload(Item.categories).selectinload(ItemCategory.category),
        selectinload(Item.assignments).options(
            selectinload(SotaAssignment.assignee),
            selectinload(SotaAssignment.reviews).selectinload(SotaReview.reviewer),
        ),
    ]


async def _load_item(db: AsyncSession, item_id: int) -> Item:
    stmt = select(Item).options(*_eager_options()).where(Item.id == item_id)
    res = await db.execute(stmt)
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.get("", response_model=list[ItemRead])
async def list_items(
    source: str | None = None,
    priority: str | None = None,
    category: str | None = None,
    since: datetime | None = None,
    min_score: int | None = Query(None, ge=0, le=10),
    item_status: str | None = Query(
        None,
        description="workflow status filter (new/triaged/holding/skipped/archived). Triage 페이지에서 'new' 만 가져올 때 사용.",
        alias="workflow",
    ),
    lifecycle: str | None = Query(None, description="lifecycle_status filter (research/dev/testing/production/deprecated)"),
    sort: str = Query(
        "published",
        pattern="^(discovered|discovered_asc|published|published_asc|score|keyword_score|priority)$",
    ),
    limit: int = Query(50, le=500),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Item).options(*_eager_options())
    if source:
        stmt = stmt.where(Item.source == source)
    if priority:
        stmt = stmt.where(Item.priority == priority)
    if since:
        stmt = stmt.where(Item.discovered_at >= since)
    if min_score is not None:
        stmt = stmt.where(Item.llm_score >= min_score)
    if category:
        stmt = stmt.join(ItemCategory).join(Category).where(Category.slug == category)
    if item_status:
        stmt = stmt.where(Item.status == item_status)
    if lifecycle:
        try:
            stmt = stmt.where(Item.lifecycle_status == LifecycleStatus(lifecycle))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Unknown lifecycle: {lifecycle}")

    order_by = SORT_MAP.get(sort, Item.published_at.desc().nullslast())
    stmt = stmt.order_by(order_by).offset(offset).limit(limit)
    result = await db.execute(stmt)
    items = result.scalars().unique().all()
    return [serialize_item(i) for i in items]


@router.get("/{item_id}", response_model=ItemRead)
async def get_item(item_id: int, db: AsyncSession = Depends(get_db)):
    item = await _load_item(db, item_id)
    return serialize_item(item)


@router.get("/{item_id}/siblings", response_model=list[ItemRead])
async def get_group_siblings(item_id: int, db: AsyncSession = Depends(get_db)):
    """Return all items sharing the same group_id (excluding self)."""
    anchor = await db.get(Item, item_id)
    if not anchor or not anchor.group_id:
        return []
    stmt = (
        select(Item)
        .options(*_eager_options())
        .where(Item.group_id == anchor.group_id, Item.id != item_id)
    )
    result = await db.execute(stmt)
    siblings = sorted(
        result.scalars().unique().all(),
        key=lambda i: SOURCE_ORDER.get(i.source, 9),
    )
    return [serialize_item(s) for s in siblings]


# ── Triage / 워크플로우 액션 ──────────────────────────────────────────────


class ItemPatch(BaseModel):
    """단일 필드 업데이트 — 라이프사이클/우선순위/workflow status 만."""
    status: Literal["new", "triaged", "holding", "skipped", "archived"] | None = None
    lifecycle_status: Literal["research", "dev", "testing", "production", "deprecated"] | None = None
    priority: Literal["P0", "P1", "P2", "P3", "WATCH"] | None = None
    description: str | None = Field(None, max_length=500)


@router.patch("/{item_id}", response_model=ItemRead)
async def patch_item(
    item_id: int,
    body: ItemPatch,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.admin, UserRole.professor)),
):
    """워크플로우 status / lifecycle_status / priority / description 업데이트."""
    item = await _load_item(db, item_id)
    data = body.model_dump(exclude_unset=True)
    if "status" in data:
        item.status = data["status"]
    if "lifecycle_status" in data:
        item.lifecycle_status = LifecycleStatus(data["lifecycle_status"])
    if "priority" in data:
        item.priority = data["priority"]
    if "description" in data:
        item.description = data["description"]
    item.version = (item.version or 1) + 1
    await db.commit()
    item = await _load_item(db, item_id)
    return serialize_item(item)


class TriageAction(BaseModel):
    """Triage 한 행 액션 — UI 의 [배정/보류/스킵/모터헤드/완료/후속개발/아카이빙] 에 매핑."""
    action: Literal[
        "assign",            # 학생 배정
        "motorhead",         # 모터헤드(외부) 진행 — assign + lifecycle=dev
        "hold",              # 보류
        "skip",              # 스킵
        "complete",          # 완료 — active assignment 모두 approved + lifecycle=testing
        "follow_up",         # 후속개발 — lifecycle=dev (기존 진행 유지)
        "archive",           # 아카이빙 — status=archived
    ]
    assignee_id: uuid.UUID | None = Field(None, description="action='assign' 또는 'motorhead' 시 필요")
    due_date: date | None = None
    note: str | None = Field(None, max_length=500, description="아카이빙/스킵 사유 등 (옵션)")


@router.post("/{item_id}/triage", response_model=ItemRead)
async def triage_item(
    item_id: int,
    body: TriageAction,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.admin, UserRole.professor)),
):
    """Triage 액션 한 번에 처리 — status + lifecycle + assignment 동시 변경.

    UI 의 빠른 분류 버튼이 이 endpoint 한 번 호출로 모든 후속 작업 처리.
    """
    item = await _load_item(db, item_id)
    a = body.action

    if a == "assign":
        if not body.assignee_id:
            raise HTTPException(status_code=400, detail="action='assign' 요구: assignee_id")
        await _create_assignment_if_missing(db, item, body.assignee_id, user.id, body.due_date)
        item.status = "triaged"

    elif a == "motorhead":
        if not body.assignee_id:
            raise HTTPException(status_code=400, detail="action='motorhead' 요구: assignee_id (external 멤버)")
        await _create_assignment_if_missing(db, item, body.assignee_id, user.id, body.due_date)
        item.status = "triaged"
        item.lifecycle_status = LifecycleStatus.dev

    elif a == "hold":
        item.status = "holding"
        if body.note:
            _stamp_metadata(item, "hold_reason", body.note)

    elif a == "skip":
        item.status = "skipped"
        if body.note:
            _stamp_metadata(item, "skip_reason", body.note)

    elif a == "complete":
        # active assignments 를 approved 로
        for asg in (item.assignments or []):
            if asg.status not in (SotaAssignmentStatus.approved, SotaAssignmentStatus.rejected):
                asg.status = SotaAssignmentStatus.approved
        item.status = "triaged"
        # research → testing 으로 전환 (이미 dev 면 testing 으로)
        if item.lifecycle_status in (LifecycleStatus.research, LifecycleStatus.dev):
            item.lifecycle_status = LifecycleStatus.testing

    elif a == "follow_up":
        item.lifecycle_status = LifecycleStatus.dev
        item.status = "triaged"

    elif a == "archive":
        item.status = "archived"
        if item.lifecycle_status not in (LifecycleStatus.production,):
            item.lifecycle_status = LifecycleStatus.deprecated
        if body.note:
            item.deprecated_reason = body.note

    item.version = (item.version or 1) + 1
    await db.commit()
    item = await _load_item(db, item_id)
    return serialize_item(item)


async def _create_assignment_if_missing(
    db: AsyncSession, item: Item, assignee_id: uuid.UUID, assigner_id: uuid.UUID, due_date: date | None,
) -> None:
    # 동일 (item, assignee) 가 이미 있으면 status 만 갱신
    for asg in (item.assignments or []):
        if asg.assignee_id == assignee_id:
            asg.status = SotaAssignmentStatus.assigned
            if due_date:
                asg.due_date = due_date
            return
    # User 존재 확인
    res = await db.execute(select(User).where(User.id == assignee_id))
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="assignee 사용자를 찾을 수 없음")
    db.add(SotaAssignment(
        sota_item_id=item.id,
        assignee_id=assignee_id,
        assigned_by=assigner_id,
        status=SotaAssignmentStatus.assigned,
        due_date=due_date,
    ))


def _stamp_metadata(item: Item, key: str, value: str) -> None:
    md = dict(item.item_metadata or {})
    md[key] = value
    md["_last_triage_at"] = datetime.utcnow().isoformat()
    item.item_metadata = md
