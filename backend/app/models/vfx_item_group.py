"""ItemGroup — unifies research across arxiv / github / huggingface sources.

A single "concept" (e.g. VOID from Netflix) might appear as:
  - arxiv: 2604.01234
  - github: Netflix/void-model
  - huggingface: netflix/void-model

All of these share a group_id pointing to one ItemGroup row.
"""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class ItemGroup(Base):
    __tablename__ = "item_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    fingerprint: Mapped[str] = mapped_column(String(200), unique=True, index=True, nullable=False)
    canonical_name: Mapped[str | None] = mapped_column(String(500))
    primary_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("items.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
