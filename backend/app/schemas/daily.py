import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.daily import BlockSection, BlockVisibility
from app.schemas.user import UserSummaryResponse


class DailyBlockCreate(BaseModel):
    content: str = Field(..., min_length=1)
    block_order: int = Field(..., ge=0)
    section: BlockSection = BlockSection.misc
    project_id: uuid.UUID | None = None
    task_id: uuid.UUID | None = None
    sota_item_id: int | None = None  # 연구 기록 — 이 블록을 SOTA 모델에 연결
    visibility: BlockVisibility = BlockVisibility.internal

    model_config = {"extra": "ignore"}


class DailyBlockUpdate(BaseModel):
    content: str | None = None
    block_order: int | None = Field(None, ge=0)
    section: BlockSection | None = None
    project_id: uuid.UUID | None = None
    task_id: uuid.UUID | None = None
    sota_item_id: int | None = None
    visibility: BlockVisibility | None = None


class TagResponse(BaseModel):
    id: uuid.UUID
    name: str
    color: str | None = None

    model_config = {"from_attributes": True}


class DailyBlockTagResponse(BaseModel):
    id: uuid.UUID
    tag: TagResponse

    model_config = {"from_attributes": True}


class DailyBlockResponse(BaseModel):
    id: uuid.UUID
    content: str
    block_order: int
    section: BlockSection
    project_id: uuid.UUID | None = None
    task_id: uuid.UUID | None = None
    sota_item_id: int | None = None
    visibility: BlockVisibility
    tags: list[DailyBlockTagResponse] = Field(default_factory=list)
    created_at: datetime

    model_config = {"from_attributes": True}


class DailyLogCreate(BaseModel):
    date: date
    raw_content: str = ""


class DailyLogUpdate(BaseModel):
    raw_content: str | None = None


class DailyLogResponse(BaseModel):
    id: uuid.UUID
    author_id: uuid.UUID
    date: date
    raw_content: str
    blocks: list[DailyBlockResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DailyLogWithAuthorResponse(BaseModel):
    id: uuid.UUID
    author_id: uuid.UUID
    author: UserSummaryResponse | None = None
    date: date
    raw_content: str
    blocks: list[DailyBlockResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DailyFeedResponse(BaseModel):
    data: list[DailyLogWithAuthorResponse]
    meta: dict
