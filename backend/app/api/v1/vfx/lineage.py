"""Lineage endpoints — technology genealogy graph."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models import Category, Item, ItemCategory, LineageEdge
from app.models.user import User, UserRole
from app.schemas.vfx.lineage import (
    LineageEdgeCreate,
    LineageEdgeRead,
    LineageGraph,
    LineageNode,
)

router = APIRouter(prefix="/lineage", tags=["lineage"])

# 사람이 직접 그릴 수 있는 관계 타입 (auto 전용 cites/same_family/wiki_ref 는 제외)
MANUAL_RELATION_TYPES = {"related", "extends", "replaces", "competes", "baseline", "derived_from"}


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
    _user: User = Depends(get_current_user),
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
    _user: User = Depends(get_current_user),
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


# ── 편집 (Phase 3 지식 그래프) — 자유 엣지 + AI 추정 confirm ──────────────────


@router.post("/edges", response_model=LineageEdgeRead, status_code=status.HTTP_201_CREATED)
async def create_lineage_edge(
    payload: LineageEdgeCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    _role: User = Depends(require_role(UserRole.professor, UserRole.admin)),
):
    """사람이 직접 그린 계보 엣지(자유 엣지) 추가. professor/admin 만."""
    if payload.parent_id == payload.child_id:
        raise HTTPException(status_code=400, detail="자기 자신과는 연결할 수 없습니다")
    rel = (payload.relationship_type or "related").strip()
    if rel not in MANUAL_RELATION_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"relationship_type 는 {sorted(MANUAL_RELATION_TYPES)} 중 하나여야 합니다",
        )
    ids = {payload.parent_id, payload.child_id}
    found = set((await db.execute(select(Item.id).where(Item.id.in_(ids)))).scalars().all())
    if found != ids:
        raise HTTPException(status_code=404, detail="존재하지 않는 항목입니다")
    edge = LineageEdge(
        parent_id=payload.parent_id,
        child_id=payload.child_id,
        relationship_type=rel,
        origin="manual",
        status="confirmed",
        created_by=user.id,
        note=(payload.note or None),
    )
    db.add(edge)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="이미 연결된 쌍입니다")
    await db.refresh(edge)
    return LineageEdgeRead.model_validate(edge)


@router.post("/edges/{edge_id}/confirm", response_model=LineageEdgeRead)
async def confirm_lineage_edge(
    edge_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    _role: User = Depends(require_role(UserRole.professor, UserRole.admin)),
):
    """AI 추정(suggested) 엣지를 확정(confirmed). professor/admin 만."""
    edge = await db.get(LineageEdge, edge_id)
    if not edge:
        raise HTTPException(status_code=404, detail="엣지를 찾을 수 없습니다")
    edge.status = "confirmed"
    if edge.created_by is None:
        edge.created_by = user.id
    await db.commit()
    await db.refresh(edge)
    return LineageEdgeRead.model_validate(edge)


@router.delete("/edges/{edge_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lineage_edge(
    edge_id: int,
    db: AsyncSession = Depends(get_db),
    _role: User = Depends(require_role(UserRole.professor, UserRole.admin)),
):
    """엣지 삭제 — 자유 엣지 제거 또는 AI 추정 reject. professor/admin 만.

    주의: origin='auto' 엣지(인용/계열/wiki 자동계산)는 삭제해도 다음 크롤/그룹핑에서
    재생성될 수 있음. 영구 제거가 목적이면 수동 엣지(manual)/추정(arca)만 대상으로 쓸 것.
    """
    edge = await db.get(LineageEdge, edge_id)
    if not edge:
        raise HTTPException(status_code=404, detail="엣지를 찾을 수 없습니다")
    await db.delete(edge)
    await db.commit()
    return None
