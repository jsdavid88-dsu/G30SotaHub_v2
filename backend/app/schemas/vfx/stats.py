"""Stats schemas for dashboard summary."""
from pydantic import BaseModel


class DashboardSummary(BaseModel):
    total_items: int
    new_this_week: int
    p0_count: int
    p1_count: int
    categories_with_updates: int
    last_crawl: str | None = None


class CategoryStats(BaseModel):
    slug: str
    name_ko: str
    total: int
    new_this_week: int
    max_priority: str | None = None
