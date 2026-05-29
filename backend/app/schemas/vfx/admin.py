"""Admin schemas — used by AI Cluster Worker + manual ops."""
from pydantic import BaseModel, ConfigDict, Field


class PendingItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source: str
    title: str
    abstract: str | None = None
    url: str | None = None  # 이슈 #16 P2: manual item 은 URL 없음
    category_slugs: list[str] = []


class ScoreUpdate(BaseModel):
    id: int
    llm_score: int
    llm_reason: str | None = None
    priority: str | None = None  # P0/P1/P2/P3/WATCH
    # Rich analysis from Arca persona — stored in item_metadata.arca
    analysis: dict | None = Field(default=None)


class ScoreUpdateResult(BaseModel):
    updated: int


class CrawlResult(BaseModel):
    source: str
    fetched: int | None = None
    scored: int | None = None
    new: int | None = None
    error: str | None = None
