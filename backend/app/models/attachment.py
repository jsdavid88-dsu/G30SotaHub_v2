import enum
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Enum, Float, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDMixin


class AttachmentOwnerType(str, enum.Enum):
    daily_block = "daily_block"
    task = "task"
    report_snapshot = "report_snapshot"
    project = "project"
    event = "event"
    project_message = "project_message"  # Phase 2.5 — 프로젝트 토론 메시지


class Attachment(UUIDMixin, Base):
    __tablename__ = "attachments"
    __table_args__ = (
        Index("ix_attachments_owner_type_owner_id", "owner_type", "owner_id"),
        Index("ix_attachments_created_by", "created_by"),
    )

    owner_type: Mapped[AttachmentOwnerType] = mapped_column(
        Enum(AttachmentOwnerType), nullable=False
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    file_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # legacy
    file_url: Mapped[str | None] = mapped_column(String, nullable=True)        # legacy (absolute URL — 신규는 storage_relpath 사용)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    storage_kind: Mapped[str | None] = mapped_column(String(50), nullable=True)
    preview_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default="now()", nullable=False
    )

    # Phase 2.5 — 미디어 + annotation 지원
    # 절대 경로 박지 말 것 — STORAGE_BASE_PATH(env) + storage_relpath 로 runtime join.
    # NAS 이전 시 robocopy + env 변경만으로 끝.
    storage_relpath: Mapped[str | None] = mapped_column(String(500), nullable=True)
    media_type: Mapped[str | None] = mapped_column(String(20), nullable=True)   # 'image' | 'video' | 'other'
    mime: Mapped[str | None] = mapped_column(String(100), nullable=True)        # 'image/png', 'video/mp4'
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_sec: Mapped[float | None] = mapped_column(Float, nullable=True)    # 영상 길이
    thumbnail_relpath: Mapped[str | None] = mapped_column(String(500), nullable=True)
