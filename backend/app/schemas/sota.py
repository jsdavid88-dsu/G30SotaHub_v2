"""SOTA schemas — Phase 1 통합 후 (2026-05-07).

Item (table: items, int PK) 을 표현. Hub SotaItem 의 UUID 응답 형식은 더 이상 사용 안 함.
- id: int (was UUID)
- summary: str | None — 의미상 abstract (호환을 위해 alias)
- 신규 노출: source/external_id/refs/lifecycle_status/llm_score/llm_reason/priority/free_tags/category_slugs
"""
import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.sota import SotaAssignmentStatus
from app.models.vfx_item import LifecycleStatus, ConfidenceStatus


# ── SotaItem Schemas ──────────────────────────────────────────────────────


class SotaItemCreate(BaseModel):
    """수동 SOTA 등록 (Hub /sota 페이지 — 교수/admin)."""
    title: str = Field(..., min_length=1, max_length=500)
    source: str | None = None
    """학회/저널 명 (NeurIPS 2017 등). 자동 크롤이 아니면 'manual' 로 저장됨."""
    url: str | None = None
    summary: str | None = None
    """abstract 와 동일 의미. Item.abstract 에 저장."""
    published_at: datetime | None = None


class SotaItemUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=500)
    source: str | None = None
    url: str | None = None
    summary: str | None = None
    published_at: datetime | None = None
    description: str | None = None
    wiki_body: str | None = None
    lifecycle_status: LifecycleStatus | None = None
    project_id: uuid.UUID | None = None
    refs: dict[str, Any] | None = None


class SotaItemResponse(BaseModel):
    """Hub /sota 페이지 + VFX 페이지 공통 응답."""
    id: int
    title: str
    source: str | None = None
    external_id: str | None = None
    url: str | None = None
    summary: str | None = None
    """Item.abstract 와 동일 — Hub frontend 호환을 위해 'summary' alias"""
    published_at: datetime | None = None
    discovered_at: datetime | None = None
    created_at: datetime  # = discovered_at (Hub 호환)
    assignments_count: int = 0
    llm_analysis: str | None = None  # placeholder

    # 통합 후 신규 필드
    description: str | None = None
    wiki_body: str | None = None
    confidence_status: ConfidenceStatus | None = None
    version: int = 1
    refs: dict[str, Any] = Field(default_factory=dict)
    lifecycle_status: LifecycleStatus = LifecycleStatus.research
    replaced_by_id: int | None = None
    deprecated_at: datetime | None = None
    project_id: uuid.UUID | None = None

    # VFX 점수
    keyword_score: int = 0
    llm_score: int = 0
    llm_reason: str | None = None
    priority: str | None = None
    free_tags: list[str] = Field(default_factory=list)
    category_slugs: list[str] = Field(default_factory=list)
    item_metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = {"from_attributes": True}


class SotaReviewResponse(BaseModel):
    id: uuid.UUID
    sota_assignment_id: uuid.UUID
    reviewer_id: uuid.UUID
    reviewer_name: str = ""
    content: str
    submitted_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SotaAssignmentResponse(BaseModel):
    id: uuid.UUID
    sota_item_id: int  # was UUID
    assignee_id: uuid.UUID
    assignee_name: str = ""
    assigned_by: uuid.UUID | None = None
    status: SotaAssignmentStatus
    due_date: date | None = None
    created_at: datetime
    reviews: list[SotaReviewResponse] = Field(default_factory=list)

    # Item 핵심 필드 nested (N+1 회피 — DailyWrite/Sota student view 용)
    item_title: str | None = None
    item_source: str | None = None
    item_url: str | None = None
    item_lifecycle_status: str | None = None
    item_priority: str | None = None

    model_config = {"from_attributes": True}


class SotaItemDetail(SotaItemResponse):
    assignments: list[SotaAssignmentResponse] = Field(default_factory=list)


# ── SotaAssignment Schemas ────────────────────────────────────────────────


class SotaAssignmentCreate(BaseModel):
    assignee_id: uuid.UUID
    due_date: date | None = None


class SotaAssignmentUpdate(BaseModel):
    status: SotaAssignmentStatus | None = None
    due_date: date | None = None


# ── SotaReview Schemas ────────────────────────────────────────────────────


class SotaReviewCreate(BaseModel):
    content: str = Field(..., min_length=1)
