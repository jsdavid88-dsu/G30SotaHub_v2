"""ProjectMessage schemas — Phase 2."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ProjectMessageCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=10000)
    parent_id: uuid.UUID | None = None  # reply 면 부모 message id


class ProjectMessageUpdate(BaseModel):
    body: str = Field(..., min_length=1, max_length=10000)


class ProjectMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    parent_id: uuid.UUID | None
    author_id: uuid.UUID
    author_name: str = ""
    body: str
    created_at: datetime
    updated_at: datetime
    reply_count: int = 0
