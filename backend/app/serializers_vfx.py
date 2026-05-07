"""Shared serialization helpers for Item models — Phase 1 통합 후 (2026-05-07)."""
from app.models import Item
from app.schemas.vfx.item import AssignmentSummary, ItemRead, ReviewSummary


def serialize_item(item: Item) -> ItemRead:
    """Convert an Item ORM model to ItemRead.

    eager-loaded 관계 (assignments / categories) 가 있으면 같이 직렬화.
    assignments 미로딩 상태면 빈 리스트.
    """
    cat_slugs = [ic.category.slug for ic in (item.categories or []) if ic.category]

    assignments_payload: list[AssignmentSummary] = []
    try:
        for a in item.assignments or []:
            reviews_payload = []
            for r in (a.reviews or []):
                reviews_payload.append(
                    ReviewSummary(
                        id=r.id,
                        reviewer_name=r.reviewer.name if getattr(r, "reviewer", None) else "",
                        content=r.content,
                        submitted_at=r.submitted_at,
                        created_at=r.created_at,
                    )
                )
            assignments_payload.append(
                AssignmentSummary(
                    id=a.id,
                    sota_item_id=a.sota_item_id,
                    assignee_id=a.assignee_id,
                    assignee_name=a.assignee.name if getattr(a, "assignee", None) else "",
                    assigned_by=a.assigned_by,
                    status=str(a.status.value if hasattr(a.status, "value") else a.status),
                    due_date=a.due_date,
                    created_at=a.created_at,
                    reviews=reviews_payload,
                )
            )
    except Exception:
        # lazy-load 회피
        assignments_payload = []

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
        # Phase 1 신규 필드 (없는 옛 데이터 안전하게 getattr)
        description=getattr(item, "description", None),
        wiki_body=getattr(item, "wiki_body", None),
        refs=getattr(item, "refs", None) or {},
        confidence_status=(
            item.confidence_status.value
            if getattr(item, "confidence_status", None) and hasattr(item.confidence_status, "value")
            else getattr(item, "confidence_status", None)
        ),
        version=getattr(item, "version", 1) or 1,
        lifecycle_status=(
            item.lifecycle_status.value
            if getattr(item, "lifecycle_status", None) and hasattr(item.lifecycle_status, "value")
            else getattr(item, "lifecycle_status", None)
        ),
        replaced_by_id=getattr(item, "replaced_by_id", None),
        deprecated_at=getattr(item, "deprecated_at", None),
        deprecated_reason=getattr(item, "deprecated_reason", None),
        project_id=getattr(item, "project_id", None),
        assignments=assignments_payload,
    )
