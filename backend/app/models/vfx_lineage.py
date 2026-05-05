"""LineageEdge — technology genealogy between items."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class LineageEdge(Base):
    __tablename__ = "lineage_edges"
    __table_args__ = (UniqueConstraint("parent_id", "child_id", name="uq_lineage_pair"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    parent_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="CASCADE"), index=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="CASCADE"), index=True)
    relationship_type: Mapped[str] = mapped_column(String(30))  # baseline/extends/replaces/competes
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
