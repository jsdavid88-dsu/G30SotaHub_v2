import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import (
    get_current_user,
    require_project_membership,
    require_project_role,
    require_role,
)
from app.models.project import Project, ProjectMember, ProjectMemberRole, ProjectStatus
from app.models.task import Task, TaskStatus
from app.models.user import User, UserRole
from app.schemas.project import (
    ProjectCreate,
    ProjectMemberCreate,
    ProjectMemberResponse,
    ProjectResponse,
    ProjectSummaryResponse,
    ProjectUpdate,
)

router = APIRouter()


@router.get("/")
async def list_projects(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    status_filter: ProjectStatus | None = Query(None, alias="status"),
    q: str | None = None,
):
    """List projects with pagination and optional status filter.

    Policy (see issues #7, #8):
    - admin, professor: see all projects
    - student, external: see only projects they are members of
    """
    query = select(Project)

    # Student + external: restrict to projects they are members of
    if current_user.role not in (UserRole.admin, UserRole.professor):
        member_project_ids = select(ProjectMember.project_id).where(
            ProjectMember.user_id == current_user.id
        )
        query = query.where(Project.id.in_(member_project_ids))

    if status_filter is not None:
        query = query.where(Project.status == status_filter)
    if q:
        query = query.where(
            Project.name.ilike(f"%{q}%") | Project.description.ilike(f"%{q}%")
        )

    # Total count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Paginated results
    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit).order_by(Project.created_at.desc())
    result = await db.execute(query)
    projects = result.scalars().all()

    # Gather member counts and task stats for returned projects
    project_ids = [p.id for p in projects]
    member_counts: dict = {}
    task_stats: dict = {}

    if project_ids:
        # Member counts per project
        mc_query = (
            select(ProjectMember.project_id, func.count().label("cnt"))
            .where(ProjectMember.project_id.in_(project_ids))
            .group_by(ProjectMember.project_id)
        )
        mc_result = await db.execute(mc_query)
        for row in mc_result:
            member_counts[row.project_id] = row.cnt

        # Task total and done counts per project
        ts_query = (
            select(
                Task.project_id,
                func.count().label("total"),
                func.count().filter(Task.status == TaskStatus.done).label("done"),
            )
            .where(Task.project_id.in_(project_ids))
            .group_by(Task.project_id)
        )
        ts_result = await db.execute(ts_query)
        for row in ts_result:
            task_stats[row.project_id] = {"total": row.total, "done": row.done}

    data = []
    for p in projects:
        d = ProjectSummaryResponse.model_validate(p)
        d.member_count = member_counts.get(p.id, 0)
        stats = task_stats.get(p.id, {})
        d.task_done = stats.get("done", 0)
        d.task_total = stats.get("total", 0)
        data.append(d)

    return {
        "data": data,
        "meta": {"page": page, "limit": limit, "total": total},
    }


@router.post("/", response_model=ProjectResponse, status_code=201)
async def create_project(
    body: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.professor, UserRole.admin)),
):
    """Create a new project. Creator is automatically added as lead."""
    project = Project(
        name=body.name,
        description=body.description,
        status=body.status,
        start_date=body.start_date,
        end_date=body.end_date,
        created_by=current_user.id,
    )
    db.add(project)
    await db.flush()

    # Add creator as project lead
    member = ProjectMember(
        project_id=project.id,
        user_id=current_user.id,
        project_role=ProjectMemberRole.lead,
    )
    db.add(member)

    await db.commit()
    await db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get project detail by ID. Members-only for student/external."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    await require_project_membership(project_id, current_user, db)
    return project


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    body: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update project. Only project lead/manager or admin can update."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Check permission: admin or project lead/manager
    if current_user.role != UserRole.admin:
        member_result = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == current_user.id,
                ProjectMember.project_role.in_([ProjectMemberRole.lead, ProjectMemberRole.manager]),
            )
        )
        if member_result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only project lead, manager, or admin can update the project",
            )

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(project, field, value)

    await db.commit()
    await db.refresh(project)
    return project


@router.get("/{project_id}/members")
async def list_members(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List members of a project. Members-only for student/external."""
    # Check project exists
    result = await db.execute(select(Project).where(Project.id == project_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    await require_project_membership(project_id, current_user, db)

    query = (
        select(ProjectMember)
        .options(selectinload(ProjectMember.user))
        .where(ProjectMember.project_id == project_id)
        .order_by(ProjectMember.joined_at)
    )
    result = await db.execute(query)
    members = result.scalars().all()

    return {"data": [ProjectMemberResponse.model_validate(m) for m in members]}


@router.post("/{project_id}/members", response_model=ProjectMemberResponse, status_code=201)
async def add_member(
    project_id: uuid.UUID,
    body: ProjectMemberCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a member to a project. Only lead/manager/professor/admin can add members."""
    # Check project exists
    result = await db.execute(select(Project).where(Project.id == project_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Check permission: admin, professor, or project lead/manager
    await require_project_role(
        project_id,
        [ProjectMemberRole.lead, ProjectMemberRole.manager],
        current_user,
        db,
    )

    # Check user exists
    result = await db.execute(select(User).where(User.id == body.user_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Check for duplicate membership
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == body.user_id,
        )
    )
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a member of this project",
        )

    member = ProjectMember(
        project_id=project_id,
        user_id=body.user_id,
        project_role=body.project_role,
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)

    # Re-fetch with user relationship
    result = await db.execute(
        select(ProjectMember)
        .options(selectinload(ProjectMember.user))
        .where(ProjectMember.id == member.id)
    )
    member = result.scalar_one()
    return member


@router.delete("/{project_id}/members/{user_id}", status_code=204)
async def remove_member(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a member from a project. Only lead/manager/professor/admin or self can remove."""
    # Check project exists
    result = await db.execute(select(Project).where(Project.id == project_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Allow members to remove themselves; otherwise require lead/manager/professor/admin
    if current_user.id != user_id:
        await require_project_role(
            project_id,
            [ProjectMemberRole.lead, ProjectMemberRole.manager],
            current_user,
            db,
        )

    # Find and delete the membership
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found in this project",
        )

    await db.delete(member)
    await db.commit()


# ── 팀 활동 피드 (Phase 1B) ────────────────────────────────────────────────


@router.get("/{project_id}/activity")
async def project_activity(
    project_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """프로젝트 활동 피드 — 멤버/태스크/데일리/공지/SOTA 통합 시간순.

    응답: [{type, actor_name, summary, target_type, target_id, timestamp}]
    """
    from app.models.daily import BlockVisibility, DailyBlock, DailyLog
    from app.models.announcement import Announcement
    from app.models import Item
    from app.models.sota import SotaAssignment, SotaReview

    # Project 존재 확인
    res = await db.execute(select(Project).where(Project.id == project_id))
    if res.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Project not found")

    events: list[dict] = []

    # 1) 멤버 합류
    members_q = await db.execute(
        select(ProjectMember, User)
        .join(User, ProjectMember.user_id == User.id)
        .where(ProjectMember.project_id == project_id)
        .order_by(ProjectMember.joined_at.desc())
        .limit(limit)
    )
    for member, user in members_q.all():
        events.append({
            "type": "member_joined",
            "actor_name": user.name,
            "actor_id": str(user.id),
            "summary": f"{user.name}님이 팀에 합류 ({member.project_role.value if hasattr(member.project_role, 'value') else member.project_role})",
            "target_type": "project",
            "target_id": str(project_id),
            "timestamp": member.joined_at.isoformat() if member.joined_at else None,
        })

    # 2) Task 생성 / 완료
    tasks_q = await db.execute(
        select(Task, User)
        .outerjoin(User, Task.created_by == User.id)
        .where(Task.project_id == project_id)
        .order_by(Task.created_at.desc())
        .limit(limit)
    )
    for task, creator in tasks_q.all():
        actor_name = creator.name if creator else "—"
        events.append({
            "type": "task_created",
            "actor_name": actor_name,
            "actor_id": str(creator.id) if creator else None,
            "summary": f"{actor_name}님이 태스크 추가: {task.title}",
            "target_type": "task",
            "target_id": str(task.id),
            "timestamp": task.created_at.isoformat() if task.created_at else None,
        })
        if task.status == TaskStatus.done and task.updated_at:
            events.append({
                "type": "task_completed",
                "actor_name": actor_name,
                "actor_id": str(creator.id) if creator else None,
                "summary": f"✓ 태스크 완료: {task.title}",
                "target_type": "task",
                "target_id": str(task.id),
                "timestamp": task.updated_at.isoformat(),
            })

    # 3) DailyBlock (visibility=project + project_id 매칭)
    blocks_q = await db.execute(
        select(DailyBlock, DailyLog, User)
        .join(DailyLog, DailyBlock.daily_log_id == DailyLog.id)
        .join(User, DailyLog.author_id == User.id)
        .where(
            DailyBlock.project_id == project_id,
            DailyBlock.visibility == BlockVisibility.project,
        )
        .order_by(DailyBlock.created_at.desc())
        .limit(limit)
    )
    for block, _log, user in blocks_q.all():
        snippet = (block.content or "").replace("\n", " ")[:100]
        events.append({
            "type": "daily_block",
            "actor_name": user.name,
            "actor_id": str(user.id),
            "summary": f"{user.name}님의 데일리: {snippet}",
            "target_type": "daily_block",
            "target_id": str(block.id),
            "timestamp": block.created_at.isoformat() if block.created_at else None,
        })

    # 4) Announcement (audience=project)
    ann_q = await db.execute(
        select(Announcement, User)
        .outerjoin(User, Announcement.author_id == User.id)
        .where(Announcement.project_id == project_id)
        .order_by(Announcement.created_at.desc())
        .limit(limit)
    )
    for ann, creator in ann_q.all():
        actor_name = creator.name if creator else "—"
        events.append({
            "type": "announcement",
            "actor_name": actor_name,
            "actor_id": str(creator.id) if creator else None,
            "summary": f"📢 공지: {ann.title}",
            "target_type": "announcement",
            "target_id": str(ann.id),
            "timestamp": ann.created_at.isoformat() if ann.created_at else None,
        })

    # 5) SotaAssignment 생성 (Item.project_id 매칭)
    assign_q = await db.execute(
        select(SotaAssignment, Item, User)
        .join(Item, SotaAssignment.sota_item_id == Item.id)
        .join(User, SotaAssignment.assignee_id == User.id)
        .where(Item.project_id == project_id)
        .order_by(SotaAssignment.created_at.desc())
        .limit(limit)
    )
    for asg, item, assignee in assign_q.all():
        events.append({
            "type": "sota_assigned",
            "actor_name": assignee.name,
            "actor_id": str(assignee.id),
            "summary": f"🎯 {assignee.name}님에게 {item.title[:60]} 배정",
            "target_type": "item",
            "target_id": str(item.id),
            "timestamp": asg.created_at.isoformat() if asg.created_at else None,
        })

    # 6) SotaReview 작성
    review_q = await db.execute(
        select(SotaReview, SotaAssignment, Item, User)
        .join(SotaAssignment, SotaReview.sota_assignment_id == SotaAssignment.id)
        .join(Item, SotaAssignment.sota_item_id == Item.id)
        .join(User, SotaReview.reviewer_id == User.id)
        .where(Item.project_id == project_id)
        .order_by(SotaReview.created_at.desc())
        .limit(limit)
    )
    for rev, _asg, item, reviewer in review_q.all():
        snippet = (rev.content or "").replace("\n", " ")[:80]
        events.append({
            "type": "sota_review",
            "actor_name": reviewer.name,
            "actor_id": str(reviewer.id),
            "summary": f"{reviewer.name}: {item.title[:40]} — {snippet}",
            "target_type": "item",
            "target_id": str(item.id),
            "timestamp": rev.created_at.isoformat() if rev.created_at else None,
        })

    # 시간순 정렬 (최신 먼저) + limit
    events = [e for e in events if e.get("timestamp")]
    events.sort(key=lambda e: e["timestamp"], reverse=True)
    return events[:limit]


# ════════════════════════════════════════════════════════════════════════
# Phase 2 — 프로젝트 메시지 보드
# ════════════════════════════════════════════════════════════════════════

from app.models.project_message import ProjectMessage
from app.schemas.project_message import (
    ProjectMessageCreate,
    ProjectMessageResponse,
    ProjectMessageUpdate,
)
from app.services.mentions import create_mention_notifications


def _build_message_response(m: ProjectMessage, reply_count: int = 0) -> ProjectMessageResponse:
    return ProjectMessageResponse(
        id=m.id,
        project_id=m.project_id,
        parent_id=m.parent_id,
        author_id=m.author_id,
        author_name=m.author.name if m.author else "",
        body=m.body,
        created_at=m.created_at,
        updated_at=m.updated_at,
        reply_count=reply_count,
    )


@router.get("/{project_id}/messages", response_model=list[ProjectMessageResponse])
async def list_project_messages(
    project_id: uuid.UUID,
    limit: int = Query(100, ge=1, le=500),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Top-level + replies 전부 시간순. Frontend 가 parent_id 로 그룹핑."""
    await require_project_membership(project_id, current_user, db)
    # top-level + replies 동시 select. 시간순 (오래된 → 최신).
    res = await db.execute(
        select(ProjectMessage)
        .options(selectinload(ProjectMessage.author))
        .where(ProjectMessage.project_id == project_id)
        .order_by(ProjectMessage.created_at.asc())
        .offset(offset).limit(limit)
    )
    messages = list(res.scalars().unique().all())

    # reply_count: top-level 만. 같은 query 결과 안에서 계산.
    reply_count_map: dict[uuid.UUID, int] = {}
    for m in messages:
        if m.parent_id:
            reply_count_map[m.parent_id] = reply_count_map.get(m.parent_id, 0) + 1

    return [_build_message_response(m, reply_count_map.get(m.id, 0)) for m in messages]


@router.post("/{project_id}/messages", response_model=ProjectMessageResponse, status_code=201)
async def create_project_message(
    project_id: uuid.UUID,
    body: ProjectMessageCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """프로젝트 메시지 작성 (또는 reply). @mention 본문 파싱 → Notification 생성."""
    await require_project_membership(project_id, user, db)
    # parent_id 가 있으면 같은 프로젝트인지 검증
    if body.parent_id:
        parent_res = await db.execute(
            select(ProjectMessage).where(ProjectMessage.id == body.parent_id)
        )
        parent = parent_res.scalar_one_or_none()
        if not parent or parent.project_id != project_id:
            raise HTTPException(status_code=400, detail="parent_id 가 같은 프로젝트의 메시지가 아닙니다")

    msg = ProjectMessage(
        project_id=project_id,
        parent_id=body.parent_id,
        author_id=user.id,
        body=body.body,
    )
    db.add(msg)
    await db.flush()

    # @mention 알림 (services/mentions.py 재사용)
    await create_mention_notifications(
        db,
        text=body.body,
        actor=user,
        source_label="프로젝트 토론",
        target_type="project_message",
        target_id=msg.id,
    )
    await db.commit()
    await db.refresh(msg)

    # author 로드해서 응답
    res = await db.execute(
        select(ProjectMessage)
        .options(selectinload(ProjectMessage.author))
        .where(ProjectMessage.id == msg.id)
    )
    msg = res.scalar_one()
    return _build_message_response(msg, 0)


@router.patch("/{project_id}/messages/{message_id}", response_model=ProjectMessageResponse)
async def update_project_message(
    project_id: uuid.UUID,
    message_id: uuid.UUID,
    body: ProjectMessageUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """본인만 수정 가능. mention 추가/제거는 신규 mention 만 알림."""
    await require_project_membership(project_id, user, db)
    res = await db.execute(
        select(ProjectMessage)
        .options(selectinload(ProjectMessage.author))
        .where(ProjectMessage.id == message_id, ProjectMessage.project_id == project_id)
    )
    msg = res.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="메시지를 찾을 수 없습니다")
    if msg.author_id != user.id and user.role not in (UserRole.admin,):
        raise HTTPException(status_code=403, detail="본인 메시지만 수정 가능합니다")

    msg.body = body.body
    # 수정 시 추가된 mention 만 알림 (단순화: 그냥 다시 파싱 — 중복 알림 가능성 있지만 본문 변경 자체가 드문 케이스)
    await create_mention_notifications(
        db,
        text=body.body,
        actor=user,
        source_label="프로젝트 토론",
        target_type="project_message",
        target_id=msg.id,
    )
    await db.commit()
    await db.refresh(msg)
    return _build_message_response(msg, 0)


@router.delete("/{project_id}/messages/{message_id}", status_code=204)
async def delete_project_message(
    project_id: uuid.UUID,
    message_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """본인 또는 admin 만 삭제."""
    await require_project_membership(project_id, user, db)
    res = await db.execute(
        select(ProjectMessage)
        .where(ProjectMessage.id == message_id, ProjectMessage.project_id == project_id)
    )
    msg = res.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="메시지를 찾을 수 없습니다")
    if msg.author_id != user.id and user.role not in (UserRole.admin,):
        raise HTTPException(status_code=403, detail="본인 메시지만 삭제 가능합니다")

    await db.delete(msg)  # cascade 로 replies 도 같이 삭제
    await db.commit()
