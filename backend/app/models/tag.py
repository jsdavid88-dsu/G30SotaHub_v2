import enum
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDMixin


class TagScopeType(str, enum.Enum):
    global_ = "global"
    project = "project"


class Tag(UUIDMixin, Base):
    __tablename__ = "tags"
    __table_args__ = (
        UniqueConstraint("scope_type", "project_id", "name"),
        CheckConstraint(
            "(scope_type = 'global' AND project_id IS NULL) OR "
            "(scope_type = 'project' AND project_id IS NOT NULL)",
            name="ck_tags_scope_project",
        ),
        Index("ix_tags_project_id", "project_id"),
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    scope_type: Mapped[TagScopeType] = mapped_column(
        Enum(TagScopeType, values_callable=lambda e: [x.value for x in e]),
        nullable=False,
        default=TagScopeType.global_,
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
