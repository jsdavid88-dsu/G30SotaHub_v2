import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class ProjectStatus(str, enum.Enum):
    active = "active"
    paused = "paused"
    completed = "completed"


class ProjectMemberRole(str, enum.Enum):
    viewer = "viewer"
    member = "member"
    manager = "manager"
    lead = "lead"


class ProjectType(str, enum.Enum):
    """3단 트리 구조 (Phase 1).

    - umbrella: 최상위 (예: 모터헤드AIxVFX)
    - discipline: 분야 (예: video_matting, head_swap) — VFX Category 와 매핑
    - initiative: 구체 작업 (예: MatAnyone3 채택 검토)
    """
    umbrella = "umbrella"
    discipline = "discipline"
    initiative = "initiative"


class Project(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "projects"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[ProjectStatus] = mapped_column(
        Enum(ProjectStatus), nullable=False, default=ProjectStatus.active
    )
    project_type: Mapped[ProjectType] = mapped_column(
        Enum(ProjectType), nullable=False, default=ProjectType.initiative,
        server_default="initiative",
    )
    # Phase 1: 3단 트리 구조 (umbrella → discipline → initiative)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    # VFX Category 와 일대일 매핑 (Phase 1: discipline 타입 Project 가 Category 를 흡수)
    vfx_category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, unique=True
    )
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    members: Mapped[list["ProjectMember"]] = relationship(back_populates="project")
    parent: Mapped["Project | None"] = relationship(
        "Project", remote_side="Project.id", back_populates="children"
    )
    children: Mapped[list["Project"]] = relationship(
        "Project", back_populates="parent", cascade="all"
    )


class ProjectMember(UUIDMixin, Base):
    __tablename__ = "project_members"
    __table_args__ = (UniqueConstraint("project_id", "user_id"),)

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    project_role: Mapped[ProjectMemberRole] = mapped_column(
        Enum(ProjectMemberRole), nullable=False, default=ProjectMemberRole.member
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    project: Mapped["Project"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship()
