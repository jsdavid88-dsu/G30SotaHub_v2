"""Phase 2.5 B — 이미지/영상 주석 API.

첨부(Attachment) 위 도형 주석 + 답글 스레드. @mention 통합.

- GET    /attachments/{att_id}/annotations   — 주석 목록 (replies 포함)
- POST   /attachments/{att_id}/annotations   — 주석 생성 (kind/geometry/body/timecode_ms)
- PATCH  /annotations/{ann_id}               — geometry/body 수정 (작성자)
- DELETE /annotations/{ann_id}               — 삭제 (작성자 또는 admin/professor)
- POST   /annotations/{ann_id}/replies       — 답글 (@mention)
- DELETE /annotations/{ann_id}/replies/{rid} — 답글 삭제 (작성자 또는 admin/professor)
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models.annotation import Annotation, AnnotationReply
from app.models.attachment import Attachment
from app.models.user import User, UserRole
from app.services.attachment_access import assert_attachment_access
from app.services.mentions import create_mention_notifications

router = APIRouter(tags=["annotations"])

ALLOWED_KINDS = {"pin", "box", "arrow", "freedraw"}


# ── Pydantic body schemas ───────────────────────────────────────

class AnnotationCreate(BaseModel):
    kind: str = "pin"
    geometry: dict = Field(default_factory=dict)
    body: str | None = None
    timecode_ms: int | None = None


class AnnotationUpdate(BaseModel):
    geometry: dict | None = None
    body: str | None = None


class ReplyCreate(BaseModel):
    body: str


# ── Serialization ───────────────────────────────────────────────

def _reply_dict(r: AnnotationReply) -> dict:
    return {
        "id": str(r.id),
        "annotation_id": str(r.annotation_id),
        "author_id": str(r.author_id),
        "author_name": r.author.name if r.author else "",
        "body": r.body,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def _annotation_dict(a: Annotation) -> dict:
    return {
        "id": str(a.id),
        "attachment_id": str(a.attachment_id),
        "author_id": str(a.author_id),
        "author_name": a.author.name if a.author else "",
        "kind": a.kind,
        "geometry": a.geometry or {},
        "body": a.body,
        "timecode_ms": a.timecode_ms,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "updated_at": a.updated_at.isoformat() if a.updated_at else None,
        "replies": [_reply_dict(r) for r in sorted(a.replies or [], key=lambda x: x.created_at or 0)],
    }


async def _get_annotation_or_404(db: AsyncSession, ann_id: uuid.UUID, user: User) -> Annotation:
    res = await db.execute(
        select(Annotation)
        .options(selectinload(Annotation.author), selectinload(Annotation.replies).selectinload(AnnotationReply.author))
        .where(Annotation.id == ann_id)
    )
    ann = res.scalar_one_or_none()
    if not ann:
        raise HTTPException(status_code=404, detail="주석을 찾을 수 없습니다")
    # 이슈 #18 P1: 이 주석이 달린 첨부에 접근 권한 있는지
    att = await db.get(Attachment, ann.attachment_id)
    if att is not None:
        await assert_attachment_access(db, att, user, write=False)
    return ann


def _can_modify(obj_author_id: uuid.UUID, user: User) -> bool:
    return obj_author_id == user.id or user.role in (UserRole.admin, UserRole.professor)


# ── Endpoints ───────────────────────────────────────────────────

@router.get("/attachments/{att_id}/annotations")
async def list_annotations(
    att_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    att = await db.get(Attachment, att_id)
    if not att:
        raise HTTPException(status_code=404, detail="첨부를 찾을 수 없습니다")
    await assert_attachment_access(db, att, _user, write=False)
    res = await db.execute(
        select(Annotation)
        .options(selectinload(Annotation.author), selectinload(Annotation.replies).selectinload(AnnotationReply.author))
        .where(Annotation.attachment_id == att_id)
        .order_by(Annotation.created_at.asc())
    )
    anns = res.scalars().unique().all()
    return [_annotation_dict(a) for a in anns]


@router.post("/attachments/{att_id}/annotations", status_code=201)
async def create_annotation(
    att_id: uuid.UUID,
    body: AnnotationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    att = await db.get(Attachment, att_id)
    if not att:
        raise HTTPException(status_code=404, detail="첨부를 찾을 수 없습니다")
    await assert_attachment_access(db, att, user, write=False)
    if body.kind not in ALLOWED_KINDS:
        raise HTTPException(status_code=400, detail=f"kind 는 {ALLOWED_KINDS} 중 하나")

    ann = Annotation(
        attachment_id=att_id,
        author_id=user.id,
        kind=body.kind,
        geometry=body.geometry or {},
        body=(body.body or None),
        timecode_ms=body.timecode_ms,
    )
    db.add(ann)
    await db.flush()

    if body.body:
        await create_mention_notifications(
            db, text=body.body, actor=user,
            source_label="이미지 주석", target_type="annotation", target_id=ann.id,
        )
    await db.commit()
    ann = await _get_annotation_or_404(db, ann.id, user)
    return _annotation_dict(ann)


@router.patch("/annotations/{ann_id}")
async def update_annotation(
    ann_id: uuid.UUID,
    body: AnnotationUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ann = await _get_annotation_or_404(db, ann_id, user)
    if not _can_modify(ann.author_id, user):
        raise HTTPException(status_code=403, detail="작성자만 수정 가능합니다")
    if body.geometry is not None:
        ann.geometry = body.geometry
    if body.body is not None:
        ann.body = body.body or None
    await db.commit()
    ann = await _get_annotation_or_404(db, ann_id, user)
    return _annotation_dict(ann)


@router.delete("/annotations/{ann_id}", status_code=204)
async def delete_annotation(
    ann_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ann = await db.get(Annotation, ann_id)
    if not ann:
        raise HTTPException(status_code=404, detail="주석 없음")
    att = await db.get(Attachment, ann.attachment_id)
    if att is not None:
        await assert_attachment_access(db, att, user, write=False)
    if not _can_modify(ann.author_id, user):
        raise HTTPException(status_code=403, detail="작성자 또는 관리자만 삭제 가능합니다")
    await db.delete(ann)  # cascade 로 replies 삭제
    await db.commit()


@router.post("/annotations/{ann_id}/replies", status_code=201)
async def create_reply(
    ann_id: uuid.UUID,
    body: ReplyCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ann = await db.get(Annotation, ann_id)
    if not ann:
        raise HTTPException(status_code=404, detail="주석 없음")
    att = await db.get(Attachment, ann.attachment_id)
    if att is not None:
        await assert_attachment_access(db, att, user, write=False)
    content = (body.body or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="내용이 비어있습니다")

    reply = AnnotationReply(annotation_id=ann_id, author_id=user.id, body=content)
    db.add(reply)
    await db.flush()

    await create_mention_notifications(
        db, text=content, actor=user,
        source_label="이미지 주석", target_type="annotation", target_id=ann_id,
    )
    await db.commit()

    res = await db.execute(
        select(AnnotationReply).options(selectinload(AnnotationReply.author)).where(AnnotationReply.id == reply.id)
    )
    return _reply_dict(res.scalar_one())


@router.delete("/annotations/{ann_id}/replies/{reply_id}", status_code=204)
async def delete_reply(
    ann_id: uuid.UUID,
    reply_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    reply = await db.get(AnnotationReply, reply_id)
    if not reply or reply.annotation_id != ann_id:
        raise HTTPException(status_code=404, detail="답글 없음")
    ann = await db.get(Annotation, ann_id)
    if ann is not None:
        att = await db.get(Attachment, ann.attachment_id)
        if att is not None:
            await assert_attachment_access(db, att, user, write=False)
    if not _can_modify(reply.author_id, user):
        raise HTTPException(status_code=403, detail="작성자 또는 관리자만 삭제 가능합니다")
    await db.delete(reply)
    await db.commit()
