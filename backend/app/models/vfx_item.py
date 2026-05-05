"""Item model — unified across sources (arxiv/github/huggingface/reddit/x)."""
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Item(Base):
    __tablename__ = "items"
    __table_args__ = (UniqueConstraint("source", "external_id", name="uq_item_source_ext"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # Identity
    source: Mapped[str] = mapped_column(String(20), index=True, nullable=False)  # arxiv/github/hf/reddit/x
    external_id: Mapped[str] = mapped_column(String(300), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)

    # Content
    title: Mapped[str] = mapped_column(Text, nullable=False)
    abstract: Mapped[str | None] = mapped_column(Text)
    authors: Mapped[str | None] = mapped_column(Text)

    # Timestamps
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    discovered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Flexible metadata (stars, downloads, likes, subreddit, author_handle, etc.)
    # Column name differs from `metadata` to avoid collision with SQLAlchemy's Table.metadata
    item_metadata: Mapped[dict] = mapped_column("item_metadata", JSON, default=dict)

    # Scoring
    keyword_score: Mapped[int] = mapped_column(Integer, default=0)
    llm_score: Mapped[int] = mapped_column(Integer, default=0)
    llm_reason: Mapped[str | None] = mapped_column(Text)
    priority: Mapped[str | None] = mapped_column(String(10))  # P0/P1/P2/P3/WATCH
    status: Mapped[str] = mapped_column(String(20), default="new")

    # Free-form tags (Arca-assigned, for uncategorized items and category evolution)
    free_tags: Mapped[list] = mapped_column(JSON, default=list)

    # Grouping — same research across multiple sources (arxiv + github + hf)
    group_id: Mapped[int | None] = mapped_column(
        ForeignKey("item_groups.id", ondelete="SET NULL"), nullable=True, index=True
    )

    categories = relationship("ItemCategory", back_populates="item", cascade="all, delete-orphan")
    comments = relationship("ItemComment", back_populates="item", cascade="all, delete-orphan")


class ItemCategory(Base):
    __tablename__ = "item_categories"

    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="CASCADE"), primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True)

    item = relationship("Item", back_populates="categories")
    category = relationship("Category", back_populates="items")
