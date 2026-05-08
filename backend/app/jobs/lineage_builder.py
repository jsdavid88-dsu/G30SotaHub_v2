"""Lineage builder — populates lineage_edges from Semantic Scholar.

Runs after a crawl or on demand. Looks up each new arXiv item's references
and creates lineage edges to any OTHER existing items in our DB that share
the same arXiv ID.

This keeps the graph focused on papers we actually track, not the entire
literature.
"""
from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import SessionLocal
from app.models import Item, LineageEdge
from app.sources.semantic_scholar import arxiv_id_from_external, fetch_paper_relations

logger = logging.getLogger(__name__)


async def _arxiv_id_to_item_id(db: AsyncSession, arxiv_id: str) -> int | None:
    row = (
        await db.execute(
            select(Item.id).where(Item.source == "arxiv", Item.external_id == arxiv_id)
        )
    ).scalar_one_or_none()
    return row


async def build_lineage_for_item(db: AsyncSession, item: Item) -> int:
    """Fetch references/citations for an arXiv item and insert edges.

    Returns number of edges added.
    """
    if item.source != "arxiv":
        return 0

    loop = asyncio.get_running_loop()
    try:
        refs, cites = await loop.run_in_executor(
            None, lambda: fetch_paper_relations(item.external_id)
        )
    except Exception as e:
        logger.warning(f"lineage fetch failed for {item.external_id}: {e}")
        return 0

    added = 0

    # References: parents of this item
    for r in refs:
        ref_arxiv = arxiv_id_from_external(r.external_ids)
        if not ref_arxiv:
            continue
        parent_id = await _arxiv_id_to_item_id(db, ref_arxiv)
        if not parent_id or parent_id == item.id:
            continue
        stmt = (
            pg_insert(LineageEdge)
            .values(parent_id=parent_id, child_id=item.id, relationship_type="cites")
            .on_conflict_do_nothing(index_elements=["parent_id", "child_id"])
        )
        await db.execute(stmt)
        added += 1

    # Citations: children of this item
    for c in cites:
        cite_arxiv = arxiv_id_from_external(c.external_ids)
        if not cite_arxiv:
            continue
        child_id = await _arxiv_id_to_item_id(db, cite_arxiv)
        if not child_id or child_id == item.id:
            continue
        stmt = (
            pg_insert(LineageEdge)
            .values(parent_id=item.id, child_id=child_id, relationship_type="cited_by")
            .on_conflict_do_nothing(index_elements=["parent_id", "child_id"])
        )
        await db.execute(stmt)
        added += 1

    if added:
        await db.commit()
    return added


async def build_lineage_for_new_items(max_items: int = 20) -> int:
    """Batch-build lineage for arXiv items that don't have any edges yet."""
    async with SessionLocal() as db:
        # Find arXiv items without lineage edges (neither parent nor child)
        stmt = (
            select(Item)
            .where(Item.source == "arxiv")
            .where(
                ~Item.id.in_(select(LineageEdge.parent_id))
                & ~Item.id.in_(select(LineageEdge.child_id))
            )
            .order_by(Item.discovered_at.desc())
            .limit(max_items)
        )
        items = list((await db.execute(stmt)).scalars().all())

        total = 0
        for item in items:
            added = await build_lineage_for_item(db, item)
            total += added
            logger.info(f"lineage[{item.external_id}] +{added} edges")

        logger.info(f"build_lineage_for_new_items: processed {len(items)} items, {total} edges")
        return total
