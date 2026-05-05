"""Submission Pydantic schemas."""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SubmissionCreate(BaseModel):
    input_type: str = Field(pattern="^(url|keyword)$")
    input_value: str = Field(min_length=2, max_length=2000)
    submitted_by: str | None = Field(default=None, max_length=100)


class SubmissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    submitted_by: str | None
    input_type: str
    input_value: str
    status: str
    reject_reason: str | None = None
    result_item_id: int | None = None
    created_at: datetime
    processed_at: datetime | None = None
