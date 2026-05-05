"""Item Pydantic schemas."""
from datetime import datetime

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
