import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class UserRole(str, enum.Enum):
    admin = "admin"
    professor = "professor"
    student = "student"
    external = "external"


class UserStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"
    pending = "pending"


class User(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False, default=UserRole.student)
    status: Mapped[UserStatus] = mapped_column(
        Enum(UserStatus), nullable=False, default=UserStatus.pending
    )
    profile_image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    major_field: Mapped[str | None] = mapped_column(String(100), nullable=True)
    interest_fields: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="'[]'")
    company: Mapped[str | None] = mapped_column(String(150), nullable=True)
    google_subject: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    google_refresh_token: Mapped[str | None] = mapped_column(String, nullable=True)
    google_calendar_connected: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")


class AdvisorRelation(UUIDMixin, Base):
    __tablename__ = "advisor_relations"
    __table_args__ = (UniqueConstraint("professor_id", "student_id"),)

    professor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    professor: Mapped["User"] = relationship(foreign_keys=[professor_id])
    student: Mapped["User"] = relationship(foreign_keys=[student_id])
