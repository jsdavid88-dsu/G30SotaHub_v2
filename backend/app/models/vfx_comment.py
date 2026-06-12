"""ItemComment — team discussion on VFX SOTA items (renamed from Comment to avoid conflict with Hub's Comment on daily_blocks)."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class ItemComment(Base):
    __tablename__ = "item_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="CASCADE"), index=True)

    # Filled from Hub OAuth (set in router via Depends(get_current_user))
    user_id: Mapped[str | None] = mapped_column(String(100))
    user_name: Mapped[str | None] = mapped_column(String(100))

    content: Mapped[str] = mapped_column(Text, nullable=False)
    # 'comment' = 일반 댓글 / 'confirm' = 컨펌(승인) — 교수·외부연구원·admin 만 작성.
    kind: Mapped[str] = mapped_column(String(20), nullable=False, server_default="comment")
    # 작성 시점 역할 스냅샷 (피드에서 "교수 컨펌" / "외부 컨펌" 구분 표시용)
    user_role: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    item = relationship("Item", back_populates="comments")
