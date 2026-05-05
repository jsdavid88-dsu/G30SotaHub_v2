"""Category model — 10 VFX domain categories."""
from sqlalchemy import JSON, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    name_ko: Mapped[str] = mapped_column(String(100), nullable=False)
    name_en: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    icon: Mapped[str | None] = mapped_column(String(50))

    # Search hints
    keywords: Mapped[list] = mapped_column(JSON, default=list)
    github_topics: Mapped[list] = mapped_column(JSON, default=list)
    hf_tags: Mapped[list] = mapped_column(JSON, default=list)
    subreddits: Mapped[list] = mapped_column(JSON, default=list)
    x_accounts: Mapped[list] = mapped_column(JSON, default=list)
    current_sota: Mapped[list] = mapped_column(JSON, default=list)

    display_order: Mapped[int] = mapped_column(Integer, default=0)

    items = relationship("ItemCategory", back_populates="category", cascade="all, delete-orphan")
