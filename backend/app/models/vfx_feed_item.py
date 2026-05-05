"""FeedItem — casual feed items (news, workflows, community posts).

Separate from the `items` table which is for research papers/models/SOTA tracking.
Feed items are more ephemeral: tutorials, news posts, workflow shares, community
discussions that the user browses and optionally bookmarks or promotes.
"""
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class FeedItem(Base):
    __tablename__ = "feed_items"
    __table_args__ = (
        UniqueConstraint("source", "external_id", name="uq_feed_source_ext"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # Identity
    source: Mapped[str] = mapped_column(String(30), index=True, nullable=False)
    # source values: firecrawl / reddit / x / hf_space / manual
    external_id: Mapped[str] = mapped_column(String(400), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)

    # Content
    title: Mapped[str] = mapped_column(Text, nullable=False)
    excerpt: Mapped[str | None] = mapped_column(Text)
    content_md: Mapped[str | None] = mapped_column(Text)  # Full markdown (from Firecrawl)
    image_url: Mapped[str | None] = mapped_column(Text)
    author: Mapped[str | None] = mapped_column(Text)

    # Timestamps
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    discovered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Tags and metadata
    tags: Mapped[list] = mapped_column(JSON, default=list)
    feed_metadata: Mapped[dict] = mapped_column("feed_metadata", JSON, default=dict)

    # User actions
    is_saved: Mapped[bool] = mapped_column(Boolean, default=False)
    saved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Link back to the main items table if user promoted this to research tracking
    promoted_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("items.id", ondelete="SET NULL"),
        nullable=True,
    )
