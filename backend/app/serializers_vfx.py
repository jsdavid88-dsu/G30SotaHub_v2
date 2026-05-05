"""Shared serialization helpers for Item models."""
from app.models import Item
from app.schemas.vfx.item import ItemRead


def serialize_item(item: Item) -> ItemRead:
    """Convert an Item ORM model (with eager-loaded categories) to ItemRead."""
    cat_slugs = [ic.category.slug for ic in item.categories if ic.category]
    return ItemRead(
        id=item.id,
        source=item.source,
        external_id=item.external_id,
        url=item.url,
        title=item.title,
        abstract=item.abstract,
        authors=item.authors,
        published_at=item.published_at,
        discovered_at=item.discovered_at,
        metadata=item.item_metadata or {},
        keyword_score=item.keyword_score,
        llm_score=item.llm_score,
        llm_reason=item.llm_reason,
        priority=item.priority,
        status=item.status,
        category_slugs=cat_slugs,
        group_id=item.group_id,
    )
