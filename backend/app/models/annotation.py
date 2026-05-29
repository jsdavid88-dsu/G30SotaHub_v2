"""Annotation — 이미지/영상 첨부 위에 그리는 주석 (Phase 2.5 B/C, 2026-05-29).

- 첨부(Attachment) 위에 도형(pin/box/arrow/freedraw)을 그리고 코멘트.
- geometry 는 0~1 비율 좌표로 저장 → 이미지/영상 해상도와 무관하게 재현.
- timecode_ms: 영상 특정 시점 마크 (Phase 2.5 C). 이미지면 null.
- AnnotationReply: 주석에 달리는 답글 (flat, @mention 통합).
"""
from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class Annotation(UUIDMixin, TimestampMixin, Base):
    """첨부 위 도형 주석 1개 + 최초 코멘트."""
    __tablename__ = "annotations"
    __table_args__ = (
        Index("ix_annotations_attachment_id", "attachment_id"),
        Index("ix_annotations_author_id", "author_id"),
    )

    attachment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attachments.id", ondelete="CASCADE"), nullable=False
    )
    author_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # pin | box | arrow | freedraw
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="pin")
    # 0~1 비율 좌표. pin:{x,y} box:{x,y,w,h} arrow:{x1,y1,x2,y2} freedraw:{points:[[x,y],...]}
    geometry: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 영상 특정 시점 (ms). 이미지는 null. Phase 2.5 C 대비 미리 둠.
    timecode_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    author: Mapped["User"] = relationship("User", foreign_keys=[author_id])
    replies: Mapped[list["AnnotationReply"]] = relationship(
        "AnnotationReply", back_populates="annotation", cascade="all, delete-orphan"
    )


class AnnotationReply(UUIDMixin, TimestampMixin, Base):
    """주석에 달리는 답글 (flat thread)."""
    __tablename__ = "annotation_replies"
    __table_args__ = (
        Index("ix_annotation_replies_annotation_id_created", "annotation_id", "created_at"),
    )

    annotation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("annotations.id", ondelete="CASCADE"), nullable=False
    )
    author_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)

    annotation: Mapped["Annotation"] = relationship("Annotation", back_populates="replies")
    author: Mapped["User"] = relationship("User", foreign_keys=[author_id])
