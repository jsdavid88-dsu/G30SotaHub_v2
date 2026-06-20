"""LineageEdge — technology genealogy between items."""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class LineageEdge(Base):
    __tablename__ = "lineage_edges"
    __table_args__ = (UniqueConstraint("parent_id", "child_id", name="uq_lineage_pair"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    parent_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="CASCADE"), index=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="CASCADE"), index=True)
    # 자동(cites/cited_by/same_family/wiki_ref) + 수동(related/extends/replaces/competes/baseline/derived_from)
    relationship_type: Mapped[str] = mapped_column(String(30))
    # origin: auto(계산) | manual(사람이 그림) | arca(AI 추정).  status: confirmed | suggested(confirm 대기)
    origin: Mapped[str] = mapped_column(String(10), nullable=False, server_default="auto")
    status: Mapped[str] = mapped_column(String(10), nullable=False, server_default="confirmed")
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
