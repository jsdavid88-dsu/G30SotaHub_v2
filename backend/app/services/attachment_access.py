"""Attachment owner 권한 경계 (이슈 #18 P1 — IDOR 방지).

attachment 는 owner_type/owner_id 로 어떤 리소스에 속하는지 정해진다.
로그인 여부만 보면 attachment UUID 만 알아도 남의 비공개 자료/주석을 열람할 수 있으므로,
owner 리소스의 접근 권한을 검사한다.

정책:
- admin/professor: 전체 허용 (연구실 운영)
- project_message: 해당 프로젝트 멤버만 (require_project_membership)
- daily_block: 작성자 본인 / internal=로그인 전체 / project=멤버 / private·advisor=거부
- 그 외(task/event/project/report_snapshot): 로그인 사용자 허용 (연구실 내부 공유 성격, 기존 동작)
"""
from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import require_project_membership
from app.models.attachment import Attachment, AttachmentOwnerType
from app.models.daily import BlockVisibility, DailyBlock, DailyLog
from app.models.project_message import ProjectMessage
from app.models.user import User, UserRole


def _enum_val(v: object) -> str:
    return v.value if hasattr(v, "value") else str(v)


async def assert_owner_access(
    db: AsyncSession,
    owner_type: AttachmentOwnerType | str,
    owner_id: uuid.UUID,
    user: User,
    *,
    write: bool = False,
) -> None:
    """owner 리소스 접근 권한 검사. 권한 없으면 403, 없는 리소스면 404."""
    # 운영진은 전체 접근
    if user.role in (UserRole.admin, UserRole.professor):
        return

    ot = _enum_val(owner_type)

    if ot == "project_message":
        msg = await db.get(ProjectMessage, owner_id)
        if msg is None:
            raise HTTPException(status_code=404, detail="대상 메시지를 찾을 수 없습니다")
        # require_project_membership 가 멤버 아니면 403
        await require_project_membership(msg.project_id, user, db)
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
            return
        if vis == BlockVisibility.project.value and block.project_id:
            await require_project_membership(block.project_id, user, db)
            return
        # private / advisor — 작성자·교수 외 거부
        raise HTTPException(status_code=403, detail="이 자료에 접근할 권한이 없습니다")

    # 그 외 owner_type — 연구실 내부 공유 성격. 로그인 사용자 허용.
    return


async def assert_attachment_access(
    db: AsyncSession, att: Attachment, user: User, *, write: bool = False
) -> None:
    """Attachment 객체의 owner 권한 검사 (assert_owner_access 위임)."""
    await assert_owner_access(db, att.owner_type, att.owner_id, user, write=write)
