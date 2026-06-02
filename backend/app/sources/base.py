"""Common types and helpers for source fetchers."""
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import httpx

logger = logging.getLogger(__name__)


def get_with_retry(url: str, *, retries: int = 3, backoff: float = 1.0, **kwargs) -> httpx.Response:
    """httpx.get + 지수 백오프 재시도 (#7 Task6).

    배치 시작 직후 DNS 블립(getaddrinfo failed) 1회로 arxiv/github 야간 전체가 0 되던 것 방지.
    ConnectError 등 일시 오류를 1s→2s→4s 로 최대 `retries` 회 재시도. 동기 (sources 는 executor 실행).
    """
    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            return httpx.get(url, **kwargs)
        except httpx.HTTPError as e:
            last_exc = e
            if attempt < retries - 1:
                wait = backoff * (2 ** attempt)
                logger.warning(
                    f"HTTP 재시도 {attempt + 1}/{retries} ({wait:.0f}s 후): "
                    f"{url[:80]} — {type(e).__name__}: {e}"
                )
                time.sleep(wait)
    assert last_exc is not None
    raise last_exc


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
