"""SOTA Assignment / Review — Hub 학생 배정 시스템.

Phase 1 통합 (2026-05-07):
- SotaItem class 제거 → app.models.vfx_item.Item 으로 통합
- SotaAssignment.sota_item_id: UUID → int FK (items.id)
- 자동 수집(arxiv/github/...) + 수동 등록(manual) 모두 학생 배정 대상
"""
import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class SotaAssignmentStatus(str, enum.Enum):
    recommended = "recommended"
    assigned = "assigned"
    in_review = "in_review"
    submitted = "submitted"
    approved = "approved"
    rejected = "rejected"


class SotaAssignment(UUIDMixin, Base):
    """학생/외부 협력자에게 SOTA 모델(Item) 배정.

    sota_item_id 는 items.id (int FK) 를 가리킴.
    모델 통합 전에는 sota_items.id (UUID) 였음.
    """
    __tablename__ = "sota_assignments"
    __table_args__ = (
        Index("ix_sota_assignments_assignee_id", "assignee_id"),
        Index("ix_sota_assignments_status", "status"),
        Index("ix_sota_assignments_due_date", "due_date"),
        Index("ix_sota_assignments_sota_item_id", "sota_item_id"),
    )

    sota_item_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("items.id", ondelete="CASCADE"), nullable=False
    )
    assignee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    assigned_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    status: Mapped[SotaAssignmentStatus] = mapped_column(
        Enum(SotaAssignmentStatus), nullable=False, default=SotaAssignmentStatus.assigned
    )
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    item: Mapped["Item"] = relationship(
        "Item", back_populates="assignments", foreign_keys=[sota_item_id]
    )
    assignee: Mapped["User"] = relationship(foreign_keys=[assignee_id])
    reviews: Mapped[list["SotaReview"]] = relationship(back_populates="sota_assignment")


class SotaReview(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "sota_reviews"
    __table_args__ = (
        Index("ix_sota_reviews_sota_assignment_id", "sota_assignment_id"),
        Index("ix_sota_reviews_reviewer_id", "reviewer_id"),
    )

    sota_assignment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sota_assignments.id", ondelete="CASCADE"), nullable=False
    )
    reviewer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    content: Mapped[str] = mapped_column(String, nullable=False)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    sota_assignment: Mapped["SotaAssignment"] = relationship(back_populates="reviews")
    reviewer: Mapped["User"] = relationship()
