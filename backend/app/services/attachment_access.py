"""Attachment owner 권한 경계 (이슈 #18 — IDOR 방지).

attachment 는 owner_type/owner_id 로 어떤 리소스에 속하는지 정해진다.
로그인 여부만 보면 attachment UUID 만 알아도 남의 비공개 자료/주석을 열람할 수 있으므로,
owner 리소스의 접근 권한을 검사한다.

정책 (deny-by-default):
- daily_block: visibility 정책 (운영진도 존중 — #18 재오픈). 작성자 본인 / admin 전체 /
  private=작성자·admin / advisor=지도교수(AdvisorRelation) / internal=학생·교수(external 제외) / project=멤버
- project_message / project: 해당 프로젝트 멤버만 (admin/professor 는 전체)
- task: task.project_id 의 프로젝트 멤버만
- sota_assignment: 배정받은 본인(assignee)만 (admin/professor 는 전체) — 테스트 영상/프레임노트
- event / report_snapshot / 알 수 없는 owner_type: 운영진(admin/professor) 전용
- admin/professor 는 (daily_block 제외) 전체 허용 — 단 owner 존재 확인 (orphan 404)
"""
from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import require_advisor_of, require_project_membership
from app.models.attachment import Attachment, AttachmentOwnerType
from app.models.daily import BlockVisibility, DailyBlock, DailyLog
from app.models.event import Event
from app.models.project import Project
from app.models.project_message import ProjectMessage
from app.models.report import ReportSnapshot
from app.models.sota import SotaAssignment
from app.models.task import Task
from app.models.user import User, UserRole


def _enum_val(v: object) -> str:
    return v.value if hasattr(v, "value") else str(v)


# owner_type → 모델 (존재 확인용)
_OWNER_MODELS = {
    "project_message": ProjectMessage,
    "daily_block": DailyBlock,
    "project": Project,
    "task": Task,
    "event": Event,
    "report_snapshot": ReportSnapshot,
    "sota_assignment": SotaAssignment,
}


async def _owner_exists(db: AsyncSession, ot: str, owner_id: uuid.UUID) -> bool:
    model = _OWNER_MODELS.get(ot)
    if model is None:
        return True  # 알 수 없는 타입 — 존재 확인 skip (운영진만 여기 도달)
    return await db.get(model, owner_id) is not None


async def _assert_daily_block_access(
    db: AsyncSession, owner_id: uuid.UUID, user: User, *, write: bool
) -> None:
    """daily_block visibility 정책 (#18 — 운영진도 존중)."""
    block = await db.get(DailyBlock, owner_id)
    if block is None:
        raise HTTPException(status_code=404, detail="대상 블록을 찾을 수 없습니다")
    log = await db.get(DailyLog, block.daily_log_id)
    author_id = log.author_id if log else None

    # 작성자 본인 — 항상 (읽기·쓰기)
    if author_id is not None and author_id == user.id:
        return
    # admin — 전체 (연구실 운영, 데일리 전체 조회 권한)
    if user.role == UserRole.admin:
        return
    # 남의 daily 에 쓰기는 작성자/admin 만
    if write:
        raise HTTPException(status_code=403, detail="본인의 데일리에만 첨부할 수 있습니다")

    vis = _enum_val(block.visibility)
    if vis == BlockVisibility.internal.value:
        # internal = 학생·교수 내부 (external 제외)
        if user.role == UserRole.external:
            raise HTTPException(status_code=403, detail="이 자료에 접근할 권한이 없습니다")
        return
    if vis == BlockVisibility.project.value and block.project_id:
        await require_project_membership(block.project_id, user, db)
        return
    if vis == BlockVisibility.advisor.value:
        # 지도교수만 (professor 이고 이 학생의 advisor 인 경우)
        if user.role == UserRole.professor and author_id is not None:
            await require_advisor_of(author_id, user, db)  # 지도 아니면 403
            return
        raise HTTPException(status_code=403, detail="이 자료에 접근할 권한이 없습니다")
    # private — 작성자·admin 만 (위에서 처리), 나머지 거부
    raise HTTPException(status_code=403, detail="이 자료에 접근할 권한이 없습니다")


async def assert_owner_access(
    db: AsyncSession,
    owner_type: AttachmentOwnerType | str,
    owner_id: uuid.UUID,
    user: User,
    *,
    write: bool = False,
) -> None:
    """owner 리소스 접근 권한 검사. 권한 없으면 403, 없는 리소스면 404."""
    ot = _enum_val(owner_type)

    # daily_block 은 운영진도 visibility 존중 → bypass 보다 먼저 (#18 재오픈)
    if ot == "daily_block":
        await _assert_daily_block_access(db, owner_id, user, write=write)
        return

    # 그 외 owner_type — 운영진은 전체 (orphan 만 404)
    if user.role in (UserRole.admin, UserRole.professor):
        if not await _owner_exists(db, ot, owner_id):
            raise HTTPException(status_code=404, detail="대상 리소스를 찾을 수 없습니다")
        return

    if ot == "project_message":
        msg = await db.get(ProjectMessage, owner_id)
        if msg is None:
            raise HTTPException(status_code=404, detail="대상 메시지를 찾을 수 없습니다")
        await require_project_membership(msg.project_id, user, db)
        return

    if ot == "project":
        proj = await db.get(Project, owner_id)
        if proj is None:
            raise HTTPException(status_code=404, detail="대상 프로젝트를 찾을 수 없습니다")
        await require_project_membership(owner_id, user, db)
        return

    if ot == "task":
        task = await db.get(Task, owner_id)
        if task is None:
            raise HTTPException(status_code=404, detail="대상 태스크를 찾을 수 없습니다")
        pid = getattr(task, "project_id", None)
        if pid is None:
            raise HTTPException(status_code=403, detail="이 자료에 접근할 권한이 없습니다")
        await require_project_membership(pid, user, db)
        return

    if ot == "sota_assignment":
        asn = await db.get(SotaAssignment, owner_id)
        if asn is None:
            raise HTTPException(status_code=404, detail="대상 배정을 찾을 수 없습니다")
        # 배정받은 본인 — 읽기·쓰기 (테스트 영상 업로드 + 프레임 노트)
        if asn.assignee_id == user.id:
            return
        raise HTTPException(status_code=403, detail="이 자료에 접근할 권한이 없습니다")

    # event / report_snapshot / 알 수 없는 owner_type — 운영진 전용
    # (admin/professor 는 위에서 통과, 여기 온 건 student/external → 거부)
    raise HTTPException(status_code=403, detail="이 자료에 접근할 권한이 없습니다")


async def assert_attachment_access(
    db: AsyncSession, att: Attachment, user: User, *, write: bool = False
) -> None:
    """Attachment 객체의 owner 권한 검사 (assert_owner_access 위임)."""
    await assert_owner_access(db, att.owner_type, att.owner_id, user, write=write)
