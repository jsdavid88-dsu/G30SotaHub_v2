import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDMixin


class ReportType(str, enum.Enum):
    weekly = "weekly"
    project_summary = "project_summary"
    advisor_summary = "advisor_summary"
    student_summary = "student_summary"
    tag_summary = "tag_summary"
    organization_summary = "organization_summary"


class ReportScopeType(str, enum.Enum):
    organization = "organization"
    project = "project"
    professor = "professor"
    student = "student"
    tag = "tag"


class ReportSnapshot(UUIDMixin, Base):
    __tablename__ = "report_snapshots"
    __table_args__ = (
        Index("ix_report_snapshots_report_type", "report_type"),
        Index("ix_report_snapshots_scope_type_scope_id", "scope_type", "scope_id"),
        Index("ix_report_snapshots_period_start", "period_start"),
        Index("ix_report_snapshots_period_end", "period_end"),
    )

    report_type: Mapped[ReportType] = mapped_column(Enum(ReportType), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    scope_type: Mapped[ReportScopeType] = mapped_column(Enum(ReportScopeType), nullable=False)
    scope_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    content: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="'{}'")
    generated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
