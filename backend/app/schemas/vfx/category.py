"""Category Pydantic schemas."""
from pydantic import BaseModel, ConfigDict


class CategoryBase(BaseModel):
    slug: str
    name_ko: str
    name_en: str
    description: str | None = None
    icon: str | None = None
    keywords: list[str] = []
    github_topics: list[str] = []
    hf_tags: list[str] = []
    subreddits: list[str] = []
    x_accounts: list[str] = []
    current_sota: list[str] = []
    display_order: int = 0


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    """부분 업데이트 — 보낸 필드만 갱신 (slug 는 변경 불가)."""
    name_ko: str | None = None
    name_en: str | None = None
    description: str | None = None
    icon: str | None = None
    keywords: list[str] | None = None
    github_topics: list[str] | None = None
    hf_tags: list[str] | None = None
    subreddits: list[str] | None = None
    x_accounts: list[str] | None = None
    current_sota: list[str] | None = None
    display_order: int | None = None


class CategoryRead(CategoryBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    item_count: int = 0
    new_this_week: int = 0
