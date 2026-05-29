"""Family grouper — 같은 모델 brand(계열) 끼리 자동 연결.

Arca scoring 이 추출한 `item_metadata.arca.brand` 를 기준으로,
같은 brand 인 item 들을 star 패턴으로 LineageEdge(relationship_type="same_family")
로 묶는다. "LTX 2.3 LoRA" 와 "LTX Video" 가 같은 'ltx' brand 면 그래프에서 연결됨.

- AI 추정 관계 (Gemma brand 추출 기반) → relationship_type="same_family" 로 구분.
  LineageFlow 에서 점선/라벨로 표시해 cites(인용)와 시각적 구분.
- 매 실행마다 same_family edge 만 재구축 (cites/cited_by 는 보존).
- 마이그레이션 불필요 — 기존 LineageEdge 재활용.

night_batch 의 grouper 단계 직후 실행.
"""
from __future__ import annotations

import logging

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import SessionLocal
from app.models import Item, LineageEdge

logger = logging.getLogger(__name__)

REL_SAME_FAMILY = "same_family"


def _brand_of(item: Item) -> str | None:
    """item_metadata.arca.brand 추출 (Arca scoring 이 채움). 없으면 None."""
    md = item.item_metadata or {}
    arca = md.get("arca") if isinstance(md, dict) else None
    if not isinstance(arca, dict):
        return None
    brand = arca.get("brand")
    if brand and isinstance(brand, str) and brand.strip():
        return brand.strip().lower()
    return None


def _pick_primary(members: list[Item]) -> Item:
    """brand 그룹의 대표 — llm_score 높은 것, 동점이면 먼저 발견된(낮은 id) 것."""
    return max(members, key=lambda x: (x.llm_score or 0, -x.id))


async def build_families() -> dict:
    """같은 brand item 끼리 same_family edge 재구축. Returns {families, edges}."""
    async with SessionLocal() as db:
        # 1. 기존 same_family edge 만 제거 (cites/cited_by 등 다른 관계는 보존)
        await db.execute(
            delete(LineageEdge).where(LineageEdge.relationship_type == REL_SAME_FAMILY)
        )
        await db.flush()

        # 2. brand 별 묶기
        items = list((await db.execute(select(Item))).scalars().all())
        by_brand: dict[str, list[Item]] = {}
        for it in items:
            brand = _brand_of(it)
            if brand:
                by_brand.setdefault(brand, []).append(it)

        # 3. 2개 이상인 brand 만 star 연결 (대표 → 멤버)
        families = 0
        edges = 0
        for brand, members in by_brand.items():
            if len(members) < 2:
                continue
            families += 1
            primary = _pick_primary(members)
            for m in members:
                if m.id == primary.id:
                    continue
                # parent=대표, child=멤버. cites edge 와 (parent,child) 충돌 시 기존 보존.
                stmt = (
                    pg_insert(LineageEdge)
                    .values(
                        parent_id=primary.id,
                        child_id=m.id,
                        relationship_type=REL_SAME_FAMILY,
                    )
                    .on_conflict_do_nothing(index_elements=["parent_id", "child_id"])
                )
                await db.execute(stmt)
                edges += 1

        await db.commit()

    logger.info(f"family_grouper: {families} families, {edges} same_family edges")
    return {"families": families, "edges": edges}
