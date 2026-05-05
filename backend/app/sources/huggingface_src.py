"""HuggingFace source — recently updated models matching keywords.

Uses huggingface_hub list_models. Public endpoint, token optional.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from huggingface_hub import HfApi
from huggingface_hub.utils import HfHubHTTPError

from app.config import settings
from app.sources.base import FetchedItem

logger = logging.getLogger(__name__)


def _get_api() -> HfApi:
    if settings.hf_token:
        return HfApi(token=settings.hf_token)
    return HfApi()


def fetch_huggingface(
    keywords: list[str] | None = None,
    tags: list[str] | None = None,
    days_back: int = 7,
    max_results: int = 30,
) -> list[FetchedItem]:
    """Search HuggingFace models by keywords + tags, filter by last_modified."""
    keywords = keywords or []
    tags = tags or []
    if not keywords and not tags:
        return []

    api = _get_api()
    cutoff = datetime.now(timezone.utc) - timedelta(days=days_back)
    seen_ids: set[str] = set()
    items: list[FetchedItem] = []

    # Run one query per keyword (HF search is single-string), merge results
    search_terms = keywords[:5]
    for term in search_terms:
        try:
            models = api.list_models(
                search=term,
                sort="lastModified",
                direction=-1,
                limit=max_results,
                cardData=False,
                fetch_config=False,
            )
        except HfHubHTTPError as e:
            logger.warning(f"HF search failed for '{term}': {e}")
            continue

        for m in models:
            if m.id in seen_ids:
                continue

            last_mod = getattr(m, "lastModified", None) or getattr(m, "last_modified", None)
            if last_mod:
                if last_mod.tzinfo is None:
                    last_mod = last_mod.replace(tzinfo=timezone.utc)
                if last_mod < cutoff:
                    continue

            # Tag filter (optional)
            model_tags = getattr(m, "tags", []) or []
            if tags and not any(t in model_tags for t in tags):
                continue

            seen_ids.add(m.id)
            items.append(
                FetchedItem(
                    source="huggingface",
                    external_id=m.id,
                    url=f"https://huggingface.co/{m.id}",
                    title=m.id,
                    abstract=None,
                    authors=m.id.split("/")[0] if "/" in m.id else None,
                    published_at=last_mod,
                    metadata={
                        "downloads": getattr(m, "downloads", 0) or 0,
                        "likes": getattr(m, "likes", 0) or 0,
                        "tags": model_tags[:15],
                        "pipeline_tag": getattr(m, "pipeline_tag", None),
                    },
                )
            )

            if len(items) >= max_results:
                break
        if len(items) >= max_results:
            break

    logger.info(f"HuggingFace: {len(items)} models")
    return items
