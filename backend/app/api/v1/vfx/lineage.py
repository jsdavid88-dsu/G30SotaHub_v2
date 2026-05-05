"""Lineage endpoints — technology genealogy graph."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Category, Item, ItemCategory, LineageEdge
from app.schemas.vfx.lineage import LineageEdgeRead, LineageGraph, LineageNode

router = APIRouter(prefix="/lineage", tags=["lineage"])


def _node_from_item(item: Item) -> LineageNode:
    return LineageNode(
        id=item.id,
        title=item.title,
        source=item.source,
        priority=item.priority,
        llm_score=item.llm_score,
        year=item.published_at.year if item.published_at else None,
        url=item.url,
    )


@router.get("/item/{item_id}", response_model=LineageGraph)
async def get_item_lineage(
    item_id: int,
    depth: int = Query(1, ge=1, le=3),
    db: AsyncSession = Depends(get_db),
):
    """Fetch lineage subgraph around a specific item.

    depth=1: direct parents + children
    depth=2: +grandparents/children
    depth=3: +great-grandparents (expensive)
    """
    root = await db.get(Item, item_id)
    if not root:
        raise HTTPException(status_code=404, detail="Item not found")

    visited: set[int] = {root.id}
    all_edges: list[LineageEdge] = []
    frontier = [root.id]

    for _ in range(depth):
        if not frontier:
            break
        edges_up_stmt = select(LineageEdge).where(LineageEdge.child_id.in_(frontier))
        edges_down_stmt = select(LineageEdge).where(LineageEdge.parent_id.in_(frontier))
        edges_up = list((await db.execute(edges_up_stmt)).scalars().all())
        edges_down = list((await db.execute(edges_down_stmt)).scalars().all())
        new_ids: list[int] = []
        for e in edges_up + edges_down:
            all_edges.append(e)
            if e.parent_id not in visited:
                visited.add(e.parent_id)
                new_ids.append(e.parent_id)
            if e.child_id not in visited:
                visited.add(e.child_id)
                new_ids.append(e.child_id)
        frontier = new_ids

    # Load all referenced items
    items_stmt = select(Item).where(Item.id.in_(visited))
    items = list((await db.execute(items_stmt)).scalars().all())

    # Deduplicate edges by (parent, child)
    seen: set[tuple[int, int]] = set()
    unique_edges = []
    for e in all_edges:
        key = (e.parent_id, e.child_id)
        if key in seen:
            continue
        seen.add(key)
        unique_edges.append(LineageEdgeRead.model_validate(e))

    return LineageGraph(
        center_id=item_id,
        nodes=[_node_from_item(i) for i in items],
        edges=unique_edges,
    )


@router.get("/category/{slug}", response_model=LineageGraph)
async def get_category_lineage(
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    """Full lineage graph for a category — all items in it plus their edges."""
    cat_stmt = select(Category).where(Category.slug == slug)
    cat = (await db.execute(cat_stmt)).scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    items_stmt = (
        select(Item)
        .join(ItemCategory, ItemCategory.item_id == Item.id)
        .where(ItemCategory.category_id == cat.id)
    )
    items = list((await db.execute(items_stmt)).scalars().unique().all())
    item_ids = {i.id for i in items}
    if not item_ids:
        return LineageGraph(nodes=[], edges=[])

    edges_stmt = select(LineageEdge).where(
        or_(
            LineageEdge.parent_id.in_(item_ids),
            LineageEdge.child_id.in_(item_ids),
        )
    )
    edges = list((await db.execute(edges_stmt)).scalars().all())

    # Include any dangling ids referenced by edges
    extra_ids = {e.parent_id for e in edges} | {e.child_id for e in edges}
    missing_ids = extra_ids - item_ids
    if missing_ids:
        extra_items = list(
            (await db.execute(select(Item).where(Item.id.in_(missing_ids)))).scalars().all()
        )
        items.extend(extra_items)

    return LineageGraph(
        nodes=[_node_from_item(i) for i in items],
        edges=[LineageEdgeRead.model_validate(e) for e in edges],
    )
