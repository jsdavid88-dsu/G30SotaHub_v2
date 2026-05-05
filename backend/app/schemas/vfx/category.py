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


class CategoryRead(CategoryBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    item_count: int = 0
    new_this_week: int = 0
