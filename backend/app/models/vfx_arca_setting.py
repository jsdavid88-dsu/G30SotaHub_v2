"""ArcaSetting — Arca(Gemma) 운영자 커스텀 지침 (singleton, id=1).

프롬프트 골격(JSON 스키마/형식)은 코드 고정. 운영자(admin/professor)가 추가하는
자연어 지침만 DB 에 저장 → score/wiki 프롬프트에 '## 운영자 추가 지침' 으로 append.
(프롬프트 전체 raw 편집은 JSON 스키마 파손 위험 때문에 의도적으로 안 함)
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ArcaSetting(Base):
    __tablename__ = "arca_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)  # singleton — 항상 1
    custom_instructions: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
