"""ProjectMessage — 프로젝트 단위 메시지 보드 (Phase 2, 2026-05-21).

팀 안 자유 토론 통합 위치. SOTA 댓글 / 데일리 댓글이 분산되어 있어서 별도로 만듦.
- 한 프로젝트 = 한 메시지 보드 (1:1)
- threaded: parent_id self-ref (top-level vs reply)
- @mention 알림 — 기존 services/mentions.py 재사용
"""
from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Index, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class ProjectMessage(UUIDMixin, TimestampMixin, Base):
    """프로젝트 메시지 — top-level 또는 reply."""
    __tablename__ = "project_messages"
    __table_args__ = (
        Index("ix_project_messages_project_id_created", "project_id", "created_at"),
        Index("ix_project_messages_parent_id", "parent_id"),
        Index("ix_project_messages_author_id", "author_id"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("project_messages.id", ondelete="CASCADE"), nullable=True
    )
    author_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)

    author: Mapped["User"] = relationship("User", foreign_keys=[author_id])
    parent: Mapped["ProjectMessage | None"] = relationship(
        "ProjectMessage", remote_side="ProjectMessage.id", back_populates="replies"
    )
    replies: Mapped[list["ProjectMessage"]] = relationship(
        "ProjectMessage", back_populates="parent", cascade="all, delete-orphan"
    )
