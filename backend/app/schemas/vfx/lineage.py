"""Lineage schemas for the technology genealogy graph."""
from pydantic import BaseModel, ConfigDict


class LineageNode(BaseModel):
    id: int  # Item ID
    title: str
    source: str
    priority: str | None = None
    llm_score: int = 0
    year: int | None = None
    url: str | None = None  # 이슈 #16 P2: manual item 은 URL 없음


class LineageEdgeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int | None = None
    parent_id: int
    child_id: int
    relationship_type: str
    origin: str = "auto"       # auto | manual | arca
    status: str = "confirmed"  # confirmed | suggested
    note: str | None = None


class LineageEdgeCreate(BaseModel):
    parent_id: int
    child_id: int
    relationship_type: str = "related"
    note: str | None = None


class LineageGraph(BaseModel):
    center_id: int | None = None
    nodes: list[LineageNode]
    edges: list[LineageEdgeRead]
