"""Item model — unified SOTA item across all sources + Hub assignment system.

Phase 1 통합 (2026-05-07):
- VFX 자동 수집 Item + Hub 학생 배정용 SotaItem 흡수
- 마스터 설계서 §5: Karpathy 온톨로지(wiki_body, refs, confidence) + 라이프사이클 + 프로젝트 트리
- 자동 수집 (source != 'manual') 과 수동 등록 (source = 'manual') 둘 다 지원
- SotaAssignment, SotaReview 가 이 테이블을 가리킴 (sota_item_id: int FK → items.id)
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class LifecycleStatus(str, enum.Enum):
    """모델 라이프사이클 (마스터 설계서 §5)."""
    research = "research"
    dev = "dev"
    testing = "testing"
    production = "production"
    deprecated = "deprecated"


class ConfidenceStatus(str, enum.Enum):
    """Karpathy 온톨로지 confidence 태그 (마스터 설계서 §4.3)."""
    verified = "verified"
    stale = "stale"
    contradicted = "contradicted"
    unverified = "unverified"


class Item(Base):
    """SOTA Item — 자동 수집(arxiv/github/hf/...) + 수동 등록(manual) 통합 모델.

    Hub SotaItem 흡수: assignments[] 가 이 테이블을 가리킴.
    """
    __tablename__ = "items"
    __table_args__ = (UniqueConstraint("source", "external_id", name="uq_item_source_ext"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # === Identity ===
    source: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    """arxiv / github / hf / reddit / x / manual (Hub 사용자 등록)"""
    external_id: Mapped[str] = mapped_column(String(300), nullable=False)
    """source 별 unique ID. manual 의 경우 'sota_legacy_{uuid}' 같은 자동 생성값"""
    url: Mapped[str | None] = mapped_column(Text)

    # === Content ===
    title: Mapped[str] = mapped_column(Text, nullable=False)
    abstract: Mapped[str | None] = mapped_column(Text)
    """원문 abstract (arxiv 등) — Hub 의 'summary' 필드와 같은 의미"""
    authors: Mapped[str | None] = mapped_column(Text)

    # === Karpathy 온톨로지 (마스터 설계서 §4-5) ===
    description: Mapped[str | None] = mapped_column(String(500))
    """50자 핵심 설명 (Arca 자동 생성, 사람 수정 가능)"""
    wiki_body: Mapped[str | None] = mapped_column(Text)
    """Markdown 본문, [[wikilink]] 포함 — wiki tier"""
    confidence_status: Mapped[ConfidenceStatus] = mapped_column(
        Enum(ConfidenceStatus, name="confidencestatus"),
        nullable=False, default=ConfidenceStatus.unverified,
        server_default=ConfidenceStatus.unverified.value,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")

    # === 외부 참조 (노드 카드용) ===
    refs: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    """{github, huggingface, arxiv, papers_with_code, x, project_page, demo}"""

    # === 라이프사이클 ===
    lifecycle_status: Mapped[LifecycleStatus] = mapped_column(
        Enum(LifecycleStatus, name="lifecyclestatus"),
        nullable=False, default=LifecycleStatus.research,
        server_default=LifecycleStatus.research.value,
    )
    replaced_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("items.id", ondelete="SET NULL"), nullable=True, index=True
    )
    """이 모델을 대체한 신규 모델 — 자기참조 FK"""
    deprecated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deprecated_reason: Mapped[str | None] = mapped_column(Text)

    # === 분야·프로젝트 ===
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    """어느 분야(L2 discipline) 또는 initiative(L3) 에 속하는지"""

    # === Timestamps ===
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    discovered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # === Flexible metadata ===
    item_metadata: Mapped[dict] = mapped_column("item_metadata", JSON, default=dict)
    """stars, downloads, likes, subreddit, author_handle, arca verdict 등"""

    # === Scoring ===
    keyword_score: Mapped[int] = mapped_column(Integer, default=0)
    llm_score: Mapped[int] = mapped_column(Integer, default=0)
    llm_reason: Mapped[str | None] = mapped_column(Text)
    priority: Mapped[str | None] = mapped_column(String(10))
    """P0 / P1 / P2 / P3 / WATCH"""
    status: Mapped[str] = mapped_column(String(20), default="new")
    """new / reviewed / hidden — crawl-side workflow"""

    # === Free-form tags ===
    free_tags: Mapped[list] = mapped_column(JSON, default=list)

    # === Grouping ===
    group_id: Mapped[int | None] = mapped_column(
        ForeignKey("item_groups.id", ondelete="SET NULL"), nullable=True, index=True
    )
    """같은 연구가 여러 source 에 흩어져 있을 때 묶음"""

    # === Relationships ===
    categories = relationship("ItemCategory", back_populates="item", cascade="all, delete-orphan")
    comments = relationship("ItemComment", back_populates="item", cascade="all, delete-orphan")
    assignments = relationship(
        "SotaAssignment",
        back_populates="item",
        cascade="all, delete-orphan",
        foreign_keys="SotaAssignment.sota_item_id",
    )
    """Hub 학생 배정 — 자동 수집된 모델도 학생에게 배정 가능"""


class ItemCategory(Base):
    __tablename__ = "item_categories"

    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="CASCADE"), primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True)

    item = relationship("Item", back_populates="categories")
    category = relationship("Category", back_populates="items")


# Hub 호환성 alias — 기존 코드가 SotaItem 로 import 하던 부분 호환
# 새 코드에서는 Item 직접 사용 권장
SotaItem = Item
