"""Common types and helpers for source fetchers."""
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class FetchedItem:
    """Normalized item from any source before DB insertion."""

    source: str
    external_id: str
    url: str
    title: str
    abstract: str | None = None
    authors: str | None = None
    published_at: datetime | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "source": self.source,
            "external_id": self.external_id,
            "url": self.url,
            "title": self.title,
            "abstract": self.abstract,
            "authors": self.authors,
            "published_at": self.published_at,
            "metadata": self.metadata,
        }
