"""Comment schemas."""
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CommentCreate(BaseModel):
    content: str


class CommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    item_id: int
    user_id: str | None
    user_name: str | None
    content: str
    created_at: datetime
    updated_at: datetime
