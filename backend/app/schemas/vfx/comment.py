"""Comment schemas."""
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CommentCreate(BaseModel):
    content: str
    kind: str = "comment"  # 'comment' | 'confirm' (컨펌은 교수·외부·admin 만)


class CommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    item_id: int
    user_id: str | None
    user_name: str | None
    content: str
    kind: str = "comment"
    user_role: str | None = None
    created_at: datetime
    updated_at: datetime
