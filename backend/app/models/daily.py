import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import TSVECTOR, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class BlockSection(str, enum.Enum):
    yesterday = "yesterday"
    today = "today"
    issue = "issue"
    misc = "misc"


class BlockVisibility(str, enum.Enum):
    private = "private"
    advisor = "advisor"
    internal = "internal"
    project = "project"


class DailyLog(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "daily_logs"
    __table_args__ = (
        UniqueConstraint("author_id", "date"),
        Index("ix_daily_logs_date", "date"),
    )

    author_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    raw_content: Mapped[str] = mapped_column(String, nullable=False, server_default="''")

    author: Mapped["User"] = relationship()
    blocks: Mapped[list["DailyBlock"]] = relationship(back_populates="daily_log")


class DailyBlock(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "daily_blocks"
    __table_args__ = (
        UniqueConstraint("daily_log_id", "block_order"),
        CheckConstraint(
            "visibility != 'project' OR project_id IS NOT NULL",
            name="ck_daily_blocks_visibility_project",
        ),
        Index("ix_daily_blocks_project_id", "project_id"),
        Index("ix_daily_blocks_section", "section"),
        Index("ix_daily_blocks_visibility", "visibility"),
        Index("ix_daily_blocks_search_vector", "search_vector", postgresql_using="gin"),
    )

    daily_log_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("daily_logs.id", ondelete="CASCADE"), nullable=False
    )
    block_order: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(String, nullable=False)
    section: Mapped[BlockSection] = mapped_column(
        Enum(BlockSection), nullable=False, default=BlockSection.misc
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    visibility: Mapped[BlockVisibility] = mapped_column(Enum(BlockVisibility), nullable=False)
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True
    )
    # 연구 기록 — 이 블록을 특정 SOTA 모델(Item)에 연결. 모델 페이지 "연구 피드"로 모임.
    # items.id 는 INTEGER (project_id/task_id 와 달리 UUID 아님).
    sota_item_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("items.id", ondelete="SET NULL"), nullable=True
    )
    search_vector: Mapped[str | None] = mapped_column(TSVECTOR, nullable=True)

    daily_log: Mapped["DailyLog"] = relationship(back_populates="blocks")
    tags: Mapped[list["DailyBlockTag"]] = relationship(back_populates="daily_block")


class DailyBlockTag(UUIDMixin, Base):
    __tablename__ = "daily_block_tags"
    __table_args__ = (
        UniqueConstraint("daily_block_id", "tag_id"),
        Index("ix_daily_block_tags_tag_id", "tag_id"),
    )

    daily_block_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("daily_blocks.id", ondelete="CASCADE"), nullable=False
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tags.id", ondelete="CASCADE"), nullable=False
    )

    daily_block: Mapped["DailyBlock"] = relationship(back_populates="tags")
    tag: Mapped["Tag"] = relationship()
