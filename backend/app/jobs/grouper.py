"""Item grouper — unifies same research across arxiv/github/huggingface sources.

Strategy:
1. Extract project name from each item (arxiv title acronym, github/hf repo name)
2. Normalize to a short key and group items sharing the same key
3. Cross-reference: arxiv code_links → github/hf external_id matching
4. Title-to-repo fuzzy match: arxiv title contains repo name (case-insensitive)

Runs after each crawl.
"""
from __future__ import annotations

import logging
import re

from sqlalchemy import select, update as sql_update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants_vfx import SOURCE_ORDER
from app.database import SessionLocal
from app.models import Item, ItemGroup

logger = logging.getLogger(__name__)


# ── Project name extraction (pure logic, no DB) ─────────────────


def _extract_project_name(title: str) -> str | None:
    """Extract project/model name from an arxiv-style title.

    Patterns:
      "VOID: Physics-aware Video Object Removal" → "void"
      "AA-Splat: Feed-forward Anti-aliased 3DGS" → "aa-splat"
      "MatAnyone 2: Video Matting with Memory" → "matanyone"
      "CoTracker3: Improved Dense Point Tracking" → "cotracker3"
      "BiRefNet: ..." → "birefnet"
    """
    if not title:
        return None

    # Pattern 1: "ProjectName: subtitle" or "ProjectName — subtitle"
    m = re.match(r'^([A-Z][A-Za-z0-9_\-]+(?:\s*\d+)?)\s*[:—–\-]\s', title)
    if m:
        return re.sub(r'[\s_\-]+', '', m.group(1)).lower()

    # Pattern 2: first word is an acronym (all caps, 2+ chars)
    first = title.split()[0] if title.split() else ""
    if len(first) >= 2 and first.replace('-', '').replace('_', '').isalpha() and first.isupper():
        return first.lower().replace('-', '').replace('_', '')

    return None


def _normalize_repo_name(external_id: str) -> str:
    """Normalize a github/hf external_id to a comparable key.

    "netflix/void-model" → "void"
    "wu1g119/BiRefNet_HR-matting" → "birefnet"
    "SoraExplora/clip" → "clip"
    """
    repo = (external_id or "").split("/")[-1].lower()
    # Strip common suffixes
    for suffix in ["-model", "_model", "-base", "-large", "-small",
                   "_hr-matting", "-hr-matting", "-matting",
                   "-portrait-tensorrt", "-tensorrt",
                   "-vit-large-patch14", "-vit-base-patch16",
                   "-polarquant-q5", "-gguf", "-fp16", "-int8"]:
        if repo.endswith(suffix):
            repo = repo[: -len(suffix)]
    # Normalize separators
    repo = re.sub(r'[\s_\-]+', '', repo)
    return repo


def compute_fingerprint(item: Item) -> str:
    """Compute a grouping key for an item."""
    if item.source == "arxiv":
        name = _extract_project_name(item.title or "")
        if name:
            return name
        # Fallback: first 3 meaningful words
        words = re.findall(r"[a-z0-9]+", (item.title or "").lower())
        stop = {"a", "an", "the", "for", "of", "and", "or", "with", "via",
                "to", "in", "on", "by", "from", "using", "based"}
        keep = [w for w in words if w not in stop and len(w) >= 2]
        return " ".join(keep[:3])

    elif item.source in ("github", "huggingface"):
        return _normalize_repo_name(item.external_id or "")

    # reddit/x: use title-based fallback
    words = re.findall(r"[a-z0-9]+", (item.title or "").lower())
    return " ".join(words[:3])


def pick_primary(items: list[Item]) -> Item:
    """Pick the best representative from a group of items."""
    return sorted(
        items,
        key=lambda it: (
            SOURCE_ORDER.get(it.source, 9),
            -(it.llm_score or 0),
            -(it.keyword_score or 0),
        ),
    )[0]


# ── DB orchestration ────────────────────────────────────────────


async def _assign_groups(db: AsyncSession, items: list[Item]) -> tuple[int, int]:
    """First pass: assign group_id by fingerprint. Returns (created, linked)."""
    created = 0
    linked = 0

    fp_to_group: dict[str, int] = {}
    existing = (await db.execute(select(ItemGroup))).scalars().all()
    for g in existing:
        fp_to_group[g.fingerprint] = g.id

    for item in items:
        fp = compute_fingerprint(item)
        if not fp:
            continue

        if fp in fp_to_group:
            group_id = fp_to_group[fp]
        else:
            stmt = (
                pg_insert(ItemGroup)
                .values(
                    fingerprint=fp,
                    canonical_name=item.title[:500] if item.title else fp,
                )
                .on_conflict_do_nothing(index_elements=["fingerprint"])
            )
            await db.execute(stmt)
            await db.flush()
            row = (
                await db.execute(
                    select(ItemGroup.id).where(ItemGroup.fingerprint == fp)
                )
            ).scalar_one()
            fp_to_group[fp] = row
            group_id = row
            created += 1

        if item.group_id != group_id:
            item.group_id = group_id
            linked += 1

    return created, linked


async def _merge_by_title_match(db: AsyncSession, items: list[Item]) -> int:
    """Match arxiv items to github/hf items when the repo name appears in the title."""
    linked = 0
    arxiv_items = [i for i in items if i.source == "arxiv"]
    repo_items = [i for i in items if i.source in ("github", "huggingface")]

    for ax in arxiv_items:
        ax_title_lower = (ax.title or "").lower()
        project = _extract_project_name(ax.title or "")
        if not project:
            continue

        for repo in repo_items:
            repo_key = _normalize_repo_name(repo.external_id or "")
            if not repo_key or len(repo_key) < 3:
                continue

            # Match if arxiv project name matches repo key
            if project != repo_key:
                continue

            # Merge into same group
            if ax.group_id and repo.group_id and ax.group_id != repo.group_id:
                old_gid = repo.group_id
                await db.execute(
                    sql_update(Item)
                    .where(Item.group_id == old_gid)
                    .values(group_id=ax.group_id)
                )
                linked += 1
            elif ax.group_id and not repo.group_id:
                repo.group_id = ax.group_id
                linked += 1
            elif repo.group_id and not ax.group_id:
                ax.group_id = repo.group_id
                linked += 1

    return linked


async def _merge_cross_references(db: AsyncSession, items: list[Item]) -> int:
    """Merge groups when arxiv code_links match github/hf items by external_id."""
    linked = 0
    arxiv_items = [i for i in items if i.source == "arxiv"]

    for ax in arxiv_items:
        md = ax.item_metadata or {}
        code_links = md.get("code_links") or []
        if not code_links:
            continue

        for link in code_links:
            if not isinstance(link, dict):
                continue
            repo_name = link.get("name", "")
            if not repo_name:
                continue

            matched_stmt = select(Item).where(
                Item.external_id == repo_name,
                Item.source.in_(("github", "huggingface")),
            )
            matched = (await db.execute(matched_stmt)).scalars().all()

            for m in matched:
                if not ax.group_id or m.group_id == ax.group_id:
                    continue
                if m.group_id:
                    await db.execute(
                        sql_update(Item)
                        .where(Item.group_id == m.group_id)
                        .values(group_id=ax.group_id)
                    )
                else:
                    m.group_id = ax.group_id
                linked += 1

    return linked


async def _update_primaries(db: AsyncSession) -> None:
    """Set primary_item_id per group."""
    groups = list((await db.execute(select(ItemGroup))).scalars().all())

    for g in groups:
        g_items = list(
            (await db.execute(select(Item).where(Item.group_id == g.id))).scalars().all()
        )
        if not g_items:
            continue
        primary = pick_primary(g_items)
        if g.primary_item_id != primary.id:
            g.primary_item_id = primary.id


async def group_items() -> dict:
    """Assign group_id to all items, then merge cross-source matches.

    Returns stats dict with created/linked counts.
    """
    async with SessionLocal() as db:
        stmt = select(Item).order_by(Item.discovered_at.asc())
        items = list((await db.execute(stmt)).scalars().all())

        # Reset all group_ids for a clean re-grouping
        for item in items:
            item.group_id = None
        await db.flush()

        # Clean out old groups
        old_groups = (await db.execute(select(ItemGroup))).scalars().all()
        for g in old_groups:
            await db.delete(g)
        await db.flush()

        created, linked = await _assign_groups(db, items)
        linked += await _merge_by_title_match(db, items)
        linked += await _merge_cross_references(db, items)
        await _update_primaries(db)

        await db.commit()

    logger.info(f"grouper: {created} groups created, {linked} items linked")
    return {"created": created, "linked": linked}
