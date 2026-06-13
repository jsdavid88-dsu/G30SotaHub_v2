"""Item endpoints — Phase 1 통합 후 (2026-05-07).

ItemRead 응답에 assignments (Hub 학생 배정 정보) 자동 eager-load.
Triage 워크플로우 (2026-05-07): PATCH /items/{id} + POST /items/{id}/triage.
"""
import asyncio
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
from app.models.attachment import Attachment
from app.models.daily import BlockVisibility, DailyBlock, DailyLog
from app.models.project import ProjectMember
from app.models.sota import SotaAssignment, SotaAssignmentStatus, SotaReview
from app.models.vfx_item import ConfidenceStatus, LifecycleStatus
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
    _user: User = Depends(get_current_user),
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


@router.get("/research-feed")
async def research_feed(
    scope: Literal["all", "category", "student", "item"] = Query("all"),
    category: str | None = Query(None, description="scope=category 일 때 분야 slug"),
    student_id: uuid.UUID | None = Query(None, description="scope=student 일 때 학생 id"),
    item_id: int | None = Query(None, description="scope=item 일 때 모델 id"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """통합 연구 피드 — 전체/분야별/학생별/모델별 필터로 연구 활동을 한 흐름으로.

    scope=all 은 운영진(admin/professor) 전용(전 랩 활동). 나머지는 가시성 필터로 안전.
    경로 충돌 회피 위해 /{item_id} 보다 먼저 정의 (빌더는 파일 끝, 호출 시점 해석).
    """
    privileged = user.role in (UserRole.admin, UserRole.professor)
    if scope == "all":
        if not privileged:
            raise HTTPException(status_code=403, detail="전체 연구 피드는 운영진 전용입니다.")
        return await _build_research_feed(db, user)
    if scope == "category":
        if not category:
            raise HTTPException(status_code=422, detail="category(분야 slug) 가 필요합니다.")
        return await _build_research_feed(db, user, category_slug=category)
    if scope == "student":
        if not student_id:
            raise HTTPException(status_code=422, detail="student_id 가 필요합니다.")
        if not privileged and student_id != user.id:
            raise HTTPException(status_code=403, detail="타인의 연구 피드는 운영진만 볼 수 있습니다.")
        return await _build_research_feed(db, user, student_id=student_id)
    if not item_id:
        raise HTTPException(status_code=422, detail="item_id 가 필요합니다.")
    return await _build_research_feed(db, user, item_id=item_id)


@router.get("/{item_id}", response_model=ItemRead)
async def get_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    item = await _load_item(db, item_id)
    return serialize_item(item)


@router.get("/{item_id}/siblings", response_model=list[ItemRead])
async def get_group_siblings(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
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


# ── Wiki 초안 자동 생성 (Karpathy 온톨로지 wiki tier) ─────────────────────

@router.post("/{item_id}/generate-wiki", response_model=ItemRead)
async def generate_item_wiki(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_role(UserRole.admin, UserRole.professor)),
):
    """Arca(Gemma)가 이 모델의 wiki 초안을 자동 생성 → wiki_body + description 채움.

    Karpathy 온톨로지 wiki tier 의 실구현. wiki_body 에 [[wikilink]] 포함.
    confidence_status 는 unverified 로 (사람 검토 전). Ollama 필요 — 실패 시 503.
    """
    item = await _load_item(db, item_id)
    from app.jobs.arca_brain import generate_wiki_draft
    from app.services.arca_settings import get_custom_instructions

    extra = await get_custom_instructions(db)  # 운영자 커스텀 지침
    result = await asyncio.get_running_loop().run_in_executor(
        None,
        lambda: generate_wiki_draft({
            "title": item.title, "source": item.source, "abstract": item.abstract,
        }, extra),
    )
    if not result:
        raise HTTPException(status_code=503, detail="Arca wiki 생성 실패 (Ollama/Gemma 연결 확인)")

    # #20: wiki_body 빈 문자열이면 생성 실패로 간주 (dict 는 왔지만 내용 없음)
    wb = str(result.get("wiki_body") or "").strip()
    if not wb:
        raise HTTPException(status_code=503, detail="Arca 가 빈 wiki 를 반환 (재시도 필요)")
    item.wiki_body = wb
    if result.get("description"):
        item.description = str(result["description"])[:500]

    # wikilinks → item_metadata.arca.wikilinks (추후 그래프 엣지 자동화용)
    md = dict(item.item_metadata or {})
    arca = dict(md.get("arca") or {})
    links = result.get("wikilinks")
    if isinstance(links, list):
        arca["wikilinks"] = [str(x) for x in links][:10]
    md["arca"] = arca
    item.item_metadata = md

    item.confidence_status = ConfidenceStatus.unverified  # Arca 생성 → 사람 검토 전
    item.version = (item.version or 1) + 1
    await db.commit()

    # wiki [[link]] → 그래프 엣지(wiki_ref) 즉시 갱신 (별도 세션)
    try:
        from app.jobs.wiki_linker import build_wiki_links
        await build_wiki_links()
    except Exception:
        pass  # 그래프 갱신 실패해도 wiki 생성은 성공으로

    item = await _load_item(db, item_id)
    return serialize_item(item)


# ── 연구 기록 피드 (Research Log) ────────────────────────────────────────────
# 한 모델(Item)에 대한 우리 랩의 연구 활동을 시간순 한 흐름으로:
#   1) 이 모델에 연결된 데일리 블록 (DailyBlock.sota_item_id) — visibility 존중
#   2) 이 모델 배정의 SotaReview (학생/외부 리뷰)
#   3) 이 모델 배정에 올린 테스트 자료 (Attachment owner_type=sota_assignment)
# 교수/외부의 컨펌·댓글은 별도 ItemComment(연구 피드 아래 토론)로 흐름이 돈다.

def _can_see_block(block: DailyBlock, author_id: uuid.UUID, user: User,
                   privileged: bool, member_project_ids: set) -> bool:
    if author_id == user.id or privileged:
        return True
    if block.visibility == BlockVisibility.internal:
        return user.role != UserRole.external  # internal = 학생·교수 (external 제외)
    if block.visibility == BlockVisibility.project and block.project_id is not None:
        return block.project_id in member_project_ids
    return False  # private / advisor → 작성자·운영진만 (위에서 처리됨)


def _media_entry(att: Attachment, author_name: str | None = None) -> dict:
    return {
        "type": "media",
        "id": f"media-{att.id}",
        "author_id": str(att.created_by) if att.created_by else None,
        "author_name": author_name,
        "media_type": att.media_type,
        "file_name": att.file_name,
        "mime": att.mime,
        "fps": att.fps,
        "preview_status": att.preview_status,
        "attachment_id": str(att.id),
        "stream_url": f"/api/v1/attachments/{att.id}/stream",
        "thumbnail_url": f"/api/v1/attachments/{att.id}/thumbnail"
        if (att.thumbnail_relpath or att.media_type == "image") else None,
        "created_at": att.created_at.isoformat() if att.created_at else None,
    }


async def _build_research_feed(
    db: AsyncSession,
    user: User,
    *,
    item_id: int | None = None,
    category_slug: str | None = None,
    student_id: uuid.UUID | None = None,
) -> list[dict]:
    """연구 활동 피드 빌더 — 스코프(모델/분야/학생/전체)별로 데일리 블록 + 리뷰 +
    테스트 자료(배정·데일리 첨부) 를 시간순 병합. visibility/역할 가시성 존중.

    데일리 블록은 항상 모델 연결(sota_item_id) 된 것만 — '연구' 기록이므로.
    """
    privileged = user.role in (UserRole.admin, UserRole.professor)
    entries: list[dict] = []
    referenced_item_ids: set[int] = set()

    member_project_ids = set(
        (await db.execute(
            select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)
        )).scalars().all()
    )

    # 스코프 → 대상 모델 id 집합 (item / category) 또는 None(student/all)
    item_ids: list[int] | None = None
    if item_id is not None:
        item_ids = [item_id]
    elif category_slug is not None:
        item_ids = list((await db.execute(
            select(ItemCategory.item_id).join(Category, ItemCategory.category_id == Category.id)
            .where(Category.slug == category_slug)
        )).scalars().all())
        if not item_ids:
            item_ids = [-1]  # 매칭 모델 없음 → 빈 결과

    # ── 1) 데일리 블록 (모델 연결된 것) ──
    bq = (
        select(DailyBlock, DailyLog.date, DailyLog.author_id, User.name)
        .join(DailyLog, DailyBlock.daily_log_id == DailyLog.id)
        .join(User, DailyLog.author_id == User.id)
        .where(DailyBlock.sota_item_id.isnot(None))
    )
    if item_ids is not None:
        bq = bq.where(DailyBlock.sota_item_id.in_(item_ids))
    if student_id is not None:
        bq = bq.where(DailyLog.author_id == student_id)
    visible_block_ids: list[uuid.UUID] = []
    block_author: dict[uuid.UUID, str] = {}
    for block, log_date, author_id, author_name in (await db.execute(bq)).all():
        if not _can_see_block(block, author_id, user, privileged, member_project_ids):
            continue
        visible_block_ids.append(block.id)
        block_author[block.id] = author_name
        if block.sota_item_id:
            referenced_item_ids.add(block.sota_item_id)
        entries.append({
            "type": "daily",
            "id": f"block-{block.id}",
            "author_id": str(author_id),
            "author_name": author_name,
            "content": block.content,
            "section": block.section.value if hasattr(block.section, "value") else str(block.section),
            "item_id": block.sota_item_id,
            "log_date": log_date.isoformat() if log_date else None,
            "created_at": block.created_at.isoformat() if block.created_at else None,
        })

    # ── 데일리 블록 첨부(영상/이미지) — 보이는 블록만 ──
    if visible_block_ids:
        block_ids_str = [str(b) for b in visible_block_ids]
        datt = (await db.execute(
            select(Attachment).where(
                Attachment.owner_type == "daily_block",
                Attachment.owner_id.in_(visible_block_ids),
            )
        )).scalars().all()
        for att in datt:
            e = _media_entry(att, block_author.get(att.owner_id))
            entries.append(e)
        _ = block_ids_str  # noqa

    # ── 배정 스코프 (리뷰 + 테스트 자료) ──
    aq = select(SotaAssignment.id, SotaAssignment.assignee_id, SotaAssignment.sota_item_id)
    if item_ids is not None:
        aq = aq.where(SotaAssignment.sota_item_id.in_(item_ids))
    if student_id is not None:
        aq = aq.where(SotaAssignment.assignee_id == student_id)
    asn_rows = (await db.execute(aq)).all()
    asn_ids = [r[0] for r in asn_rows]
    asn_owner = {r[0]: r[1] for r in asn_rows}
    asn_item = {r[0]: r[2] for r in asn_rows}

    if asn_ids:
        # 2) 리뷰 — 운영진 전체, 그 외 본인 배정/본인 작성만
        rev_rows = (await db.execute(
            select(SotaReview, User.name, SotaAssignment.assignee_id, SotaAssignment.sota_item_id)
            .join(User, SotaReview.reviewer_id == User.id)
            .join(SotaAssignment, SotaReview.sota_assignment_id == SotaAssignment.id)
            .where(SotaReview.sota_assignment_id.in_(asn_ids))
        )).all()
        for rev, reviewer_name, assignee_id, sota_item in rev_rows:
            if not (privileged or assignee_id == user.id or rev.reviewer_id == user.id):
                continue
            if sota_item:
                referenced_item_ids.add(sota_item)
            entries.append({
                "type": "review",
                "id": f"review-{rev.id}",
                "author_id": str(rev.reviewer_id),
                "author_name": reviewer_name,
                "content": rev.content,
                "item_id": sota_item,
                "created_at": (rev.submitted_at or rev.created_at).isoformat()
                if (rev.submitted_at or getattr(rev, "created_at", None)) else None,
            })

        # 3) 테스트 자료 (배정 첨부) — 운영진 전체, 그 외 본인 배정/업로더만
        att_rows = (await db.execute(
            select(Attachment).where(
                Attachment.owner_type == "sota_assignment",
                Attachment.owner_id.in_(asn_ids),
            )
        )).scalars().all()
        for att in att_rows:
            if not (privileged or asn_owner.get(att.owner_id) == user.id or att.created_by == user.id):
                continue
            sota_item = asn_item.get(att.owner_id)
            if sota_item:
                referenced_item_ids.add(sota_item)
            e = _media_entry(att)
            e["item_id"] = sota_item
            entries.append(e)

    # 모델 제목 라벨 부착 (어느 모델 활동인지)
    if referenced_item_ids:
        titles = dict((await db.execute(
            select(Item.id, Item.title).where(Item.id.in_(referenced_item_ids))
        )).all())
        for e in entries:
            iid = e.get("item_id")
            if iid is not None:
                e["item_title"] = titles.get(iid)

    entries.sort(key=lambda e: e.get("created_at") or "", reverse=True)
    return entries


@router.get("/{item_id}/research-log")
async def research_log(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """모델별 연구 활동 피드 (데일리 블록 + 리뷰 + 테스트 자료), 시간순 desc."""
    if not await db.get(Item, item_id):
        raise HTTPException(status_code=404, detail="Item not found")
    return await _build_research_feed(db, user, item_id=item_id)
