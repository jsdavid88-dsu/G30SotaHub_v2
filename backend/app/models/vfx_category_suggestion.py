"""CategorySuggestion — Arca proposes new categories when tags accumulate."""
from datetime import datetime

from sqlalchemy import DateTime, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class CategorySuggestion(Base):
    __tablename__ = "category_suggestions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tag: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    item_count: Mapped[int] = mapped_column(Integer, default=0)
    suggested_name_ko: Mapped[str | None] = mapped_column(String(200))
    suggested_name_en: Mapped[str | None] = mapped_column(String(200))
    suggested_keywords: Mapped[list] = mapped_column(JSON, default=list)
    arca_reason: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending/approved/rejected
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
