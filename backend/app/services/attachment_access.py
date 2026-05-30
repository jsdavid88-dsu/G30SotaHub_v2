"""Attachment owner 권한 경계 (이슈 #18 — IDOR 방지).

attachment 는 owner_type/owner_id 로 어떤 리소스에 속하는지 정해진다.
로그인 여부만 보면 attachment UUID 만 알아도 남의 비공개 자료/주석을 열람할 수 있으므로,
owner 리소스의 접근 권한을 검사한다.

정책 (deny-by-default — 명시 안 한 owner_type 은 운영진 전용):
- admin/professor: 전체 허용 (단 owner 리소스 존재 확인 — orphan 방지)
- project_message: 해당 프로젝트 멤버만
- project: 해당 프로젝트 멤버만
- task: task.project_id 의 프로젝트 멤버만
- daily_block: 작성자 본인 / internal=학생·교수(external 제외) / project=멤버 / private·advisor=거부
- event / report_snapshot / 알 수 없는 owner_type: 운영진(admin/professor) 전용
"""
from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import require_project_membership
from app.models.attachment import Attachment, AttachmentOwnerType
from app.models.daily import BlockVisibility, DailyBlock, DailyLog
from app.models.event import Event
from app.models.project import Project
from app.models.project_message import ProjectMessage
from app.models.report import ReportSnapshot
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
}


async def _owner_exists(db: AsyncSession, ot: str, owner_id: uuid.UUID) -> bool:
    model = _OWNER_MODELS.get(ot)
    if model is None:
        return True  # 알 수 없는 타입 — 존재 확인 skip (운영진만 여기 도달)
    return await db.get(model, owner_id) is not None


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

    # 운영진은 전체 접근 — 단 orphan(없는 owner) 은 404 (이슈 #18 P2)
    if user.role in (UserRole.admin, UserRole.professor):
        if not await _owner_exists(db, ot, owner_id):
            raise HTTPException(status_code=404, detail="대상 리소스를 찾을 수 없습니다")
        return

    if ot == "project_message":
        msg = await db.get(ProjectMessage, owner_id)
        if msg is None:
            raise HTTPException(status_code=404, detail="대상 메시지를 찾을 수 없습니다")
        await require_project_membership(msg.project_id, user, db)  # 멤버 아니면 403
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

    if ot == "daily_block":
        block = await db.get(DailyBlock, owner_id)
        if block is None:
            raise HTTPException(status_code=404, detail="대상 블록을 찾을 수 없습니다")
        log = await db.get(DailyLog, block.daily_log_id)
        # 작성자 본인은 항상 (읽기·쓰기)
        if log is not None and log.author_id == user.id:
            return
        # 남의 daily 에 쓰기는 금지
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
        # private / advisor — 작성자·교수 외 거부 (교수는 위 운영진 분기에서 통과)
        raise HTTPException(status_code=403, detail="이 자료에 접근할 권한이 없습니다")

    # event / report_snapshot / 알 수 없는 owner_type — 운영진 전용
    # (admin/professor 는 위에서 통과, 여기 온 건 student/external → 거부)
    raise HTTPException(status_code=403, detail="이 자료에 접근할 권한이 없습니다")


async def assert_attachment_access(
    db: AsyncSession, att: Attachment, user: User, *, write: bool = False
) -> None:
    """Attachment 객체의 owner 권한 검사 (assert_owner_access 위임)."""
    await assert_owner_access(db, att.owner_type, att.owner_id, user, write=write)
