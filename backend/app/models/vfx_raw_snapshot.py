"""ModelRawSnapshot — Karpathy 온톨로지 raw tier: 소스 원본의 불변 스냅샷.

크롤러가 가져온 그대로(title/abstract/authors/url/source metadata)를 변경 불가로 보존한다.
wiki tier(Item.wiki_body — Arca/사람이 큐레이션)와 분리 → 출처·이력 추적(provenance).
같은 item 이라도 raw 내용이 바뀌면(재크롤) content_hash 가 달라 새 row 추가(이력 누적).
"""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ModelRawSnapshot(Base):
    __tablename__ = "model_raw_snapshots"
    __table_args__ = (UniqueConstraint("item_id", "content_hash", name="uq_raw_item_hash"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    item_id: Mapped[int] = mapped_column(
        ForeignKey("items.id", ondelete="CASCADE"), index=True, nullable=False
    )

    # source 식별 (item 과 동일 — 조회 편의)
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    external_id: Mapped[str] = mapped_column(String(300), nullable=False)

    # === 불변 원본 (소스가 준 그대로) ===
    raw_title: Mapped[str | None] = mapped_column(Text)
    raw_abstract: Mapped[str | None] = mapped_column(Text)
    raw_authors: Mapped[str | None] = mapped_column(Text)
    raw_url: Mapped[str | None] = mapped_column(Text)
    raw_metadata: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    """소스 metadata 에서 우리 큐레이션 키(arca/wikilinks) 제외한 원본."""

    # 동일 content dedup + 변경 감지
    content_hash: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
