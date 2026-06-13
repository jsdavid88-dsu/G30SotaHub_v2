import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDMixin


class NotificationType(str, enum.Enum):
    task_assigned = "task_assigned"
    task_updated = "task_updated"
    daily_comment = "daily_comment"
    daily_issue = "daily_issue"
    attendance_missing = "attendance_missing"
    event_reminder = "event_reminder"
    report_published = "report_published"
    sota_assigned = "sota_assigned"
    announcement = "announcement"
    # 연구 사이클 — 모델 댓글/컨펌, 리뷰 제출
    model_comment = "model_comment"
    model_confirm = "model_confirm"
    sota_review = "sota_review"


class Notification(UUIDMixin, Base):
    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_user_id", "user_id"),
        Index("ix_notifications_user_id_is_read", "user_id", "is_read"),
        Index("ix_notifications_created_at", "created_at"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    notification_type: Mapped[NotificationType] = mapped_column(
        Enum(NotificationType), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str | None] = mapped_column(String, nullable=True)
    target_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    target_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    delivery_channels: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default="'[\"in_app\"]'"
    )
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship()
