"""Feed item schemas."""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class FeedItemBase(BaseModel):
    source: str
    external_id: str
    url: str
    title: str
    excerpt: str | None = None
    content_md: str | None = None
    image_url: str | None = None
    author: str | None = None
    published_at: datetime | None = None
    tags: list[str] = []


class FeedItemCreate(FeedItemBase):
    feed_metadata: dict = Field(default_factory=dict)


class FeedItemRead(FeedItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    discovered_at: datetime
    feed_metadata: dict = Field(default_factory=dict)
    is_saved: bool = False
    saved_at: datetime | None = None
    promoted_item_id: int | None = None


class FeedSaveToggle(BaseModel):
    is_saved: bool


class FeedCrawlResult(BaseModel):
    source: str
    fetched: int | None = None
    new: int | None = None
    error: str | None = None
