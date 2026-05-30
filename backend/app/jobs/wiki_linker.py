"""Wiki linker — wiki_body 의 [[wikilink]] 를 실제 그래프 엣지로 연결.

Karpathy 온톨로지의 핵심: wiki 의 [[X]] 가 자동으로 지식 그래프를 형성.
Arca 가 생성한 wiki 의 [[term]] 이 다른 모델의 brand 와 매칭되면
LineageEdge(relationship_type="wiki_ref") 를 만든다 → LineageFlow 에 즉시 표시.

- same_family(같은 brand) 와 구분: wiki_ref 는 **다른 계열을 명시적으로 참조**한 것.
- 매칭은 brand 기반만 (보수적 — 오연결 방지). 카테고리/미등록 term 은 dangling 으로 보존.
- 매 실행마다 wiki_ref edge 만 재구축 (cites/same_family 보존).
"""
from __future__ import annotations

import logging
import re

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import SessionLocal
from app.jobs.arca_brain import normalize_brand
from app.jobs.family_grouper import _brand_of, _pick_primary
from app.models import Item, LineageEdge

logger = logging.getLogger(__name__)

REL_WIKI_REF = "wiki_ref"
_WIKILINK_RE = re.compile(r"\[\[([^\]]+)\]\]")


def _extract_wikilinks(item: Item) -> list[str]:
    """item 의 wikilink term 목록 (정규화). metadata.arca.wikilinks 우선, 없으면 wiki_body 파싱."""
    md = item.item_metadata or {}
    arca = md.get("arca") if isinstance(md, dict) else None
    raw_links: list[str] = []
    if isinstance(arca, dict) and isinstance(arca.get("wikilinks"), list):
        raw_links = [str(x) for x in arca["wikilinks"]]
    elif item.wiki_body:
        raw_links = _WIKILINK_RE.findall(item.wiki_body)
    out: list[str] = []
    for x in raw_links:
        nb = normalize_brand(x)
        if nb:
            out.append(nb)
    return out


async def build_wiki_links() -> dict:
    """wiki [[link]] → 다른 brand 대표 모델로 wiki_ref edge 재구축. Returns {edges, linked_items}."""
    async with SessionLocal() as db:
        # 기존 wiki_ref edge 만 제거 (cites/same_family 보존)
        await db.execute(delete(LineageEdge).where(LineageEdge.relationship_type == REL_WIKI_REF))
        await db.flush()

        items = list((await db.execute(select(Item))).scalars().all())

        # brand → 대표 item id (가장 높은 llm_score)
        by_brand: dict[str, list[Item]] = {}
        for it in items:
            b = _brand_of(it)
            if b:
                by_brand.setdefault(b, []).append(it)
        brand_primary = {b: _pick_primary(ms).id for b, ms in by_brand.items()}

        edges = 0
        linked_items = 0
        for it in items:
            my_brand = _brand_of(it)
            targets: set[int] = set()
            for term in _extract_wikilinks(it):
                if term == my_brand:
                    continue  # 자기 계열 = same_family 가 처리
                target_id = brand_primary.get(term)
                if not target_id or target_id == it.id:
                    continue  # 매칭 없음(dangling) 또는 자기 자신
                targets.add(target_id)
            for target_id in targets:
                stmt = (
                    pg_insert(LineageEdge)
                    .values(parent_id=it.id, child_id=target_id, relationship_type=REL_WIKI_REF)
                    .on_conflict_do_nothing(index_elements=["parent_id", "child_id"])
                )
                await db.execute(stmt)
                edges += 1
            if targets:
                linked_items += 1

        await db.commit()

    logger.info(f"wiki_linker: {edges} wiki_ref edges from {linked_items} items")
    return {"edges": edges, "linked_items": linked_items}
