"""Item Pydantic schemas — Phase 1 통합 후 (2026-05-07).

Item (table: items) 응답에 통합 필드 + Hub 학생 배정(assignments) 정보 포함.
"""
from datetime import date, datetime
from typing import Any
import uuid

from pydantic import BaseModel, ConfigDict, Field


class ItemBase(BaseModel):
    source: str
    external_id: str
    url: str
    title: str
    abstract: str | None = None
    authors: str | None = None
    published_at: datetime | None = None


class ItemCreate(ItemBase):
    metadata: dict = Field(default_factory=dict)


# ── Assignment / Review nested schemas (Hub 통합) ─────────────────────────


class ReviewSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    reviewer_name: str = ""
    content: str
    submitted_at: datetime | None = None
    created_at: datetime


class AssignmentSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    sota_item_id: int
    assignee_id: uuid.UUID
    assignee_name: str = ""
    assigned_by: uuid.UUID | None = None
    status: str
    due_date: date | None = None
    created_at: datetime
    reviews: list[ReviewSummary] = Field(default_factory=list)


# ── Main Item schema ──────────────────────────────────────────────────────


class ItemRead(ItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    discovered_at: datetime
    item_metadata: dict = Field(default_factory=dict, alias="metadata")
    keyword_score: int = 0
    llm_score: int = 0
    llm_reason: str | None = None
    priority: str | None = None
    status: str = "new"
    category_slugs: list[str] = []
    group_id: int | None = None

    # === Phase 1 통합 신규 필드 ===
    description: str | None = None
    wiki_body: str | None = None
    refs: dict[str, Any] = Field(default_factory=dict)
    confidence_status: str | None = None
    version: int = 1
    lifecycle_status: str | None = None
    replaced_by_id: int | None = None
    deprecated_at: datetime | None = None
    deprecated_reason: str | None = None
    project_id: uuid.UUID | None = None

    # === Hub 학생 배정 (eager-loaded 시에만) ===
    assignments: list[AssignmentSummary] = Field(default_factory=list)
