"""raw tier 스냅샷 — Item 의 소스 원본을 ModelRawSnapshot 으로 불변 보존 (Karpathy raw/).

night_batch 크롤 직후 실행: 최근 Item 의 raw 필드(title/abstract/authors/url + 소스 metadata)를
content_hash 로 dedup 하여 스냅샷. 동일 content 는 skip(불변), 변경되면 새 row(이력).
metadata 에서 우리 큐레이션 키(arca/wikilinks)는 제외 → 순수 소스 원본만.
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import SessionLocal
from app.models import Item, ModelRawSnapshot

logger = logging.getLogger(__name__)

# Item.item_metadata 에서 우리가 덧붙인 큐레이션 키 (raw 에서 제외)
_CURATION_KEYS = {"arca", "wikilinks"}


def _raw_metadata(item: Item) -> dict:
    md = item.item_metadata or {}
    if not isinstance(md, dict):
        return {}
    return {k: v for k, v in md.items() if k not in _CURATION_KEYS}


def _content_hash(item: Item, raw_md: dict) -> str:
    payload = json.dumps(
        {
            "t": item.title or "",
            "a": item.abstract or "",
            "au": item.authors or "",
            "u": item.url or "",
            "m": raw_md,
        },
        sort_keys=True,
        ensure_ascii=False,
        default=str,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def snapshot_raw(backfill: bool = False, since_hours: int = 48) -> dict:
    """최근(또는 backfill=전체) Item 의 raw 원본 스냅샷 생성.

    동일 (item_id, content_hash) 는 on_conflict_do_nothing → 불변/중복 방지.
    """
    created = 0
    scanned = 0
    async with SessionLocal() as db:
        stmt = select(Item)
        if not backfill:
            since = datetime.now(timezone.utc) - timedelta(hours=since_hours)
            stmt = stmt.where(Item.discovered_at >= since)
        items = list((await db.execute(stmt)).scalars().all())
        scanned = len(items)

        for it in items:
            raw_md = _raw_metadata(it)
            h = _content_hash(it, raw_md)
            stmt_ins = (
                pg_insert(ModelRawSnapshot)
                .values(
                    item_id=it.id,
                    source=it.source,
                    external_id=it.external_id,
                    raw_title=it.title,
                    raw_abstract=it.abstract,
                    raw_authors=it.authors,
                    raw_url=it.url,
                    raw_metadata=raw_md,
                    content_hash=h,
                )
                .on_conflict_do_nothing(index_elements=["item_id", "content_hash"])
            )
            res = await db.execute(stmt_ins)
            if res.rowcount:
                created += 1
        await db.commit()

    logger.info(f"[raw] snapshots created={created}/{scanned} (backfill={backfill})")
    return {"step": "raw_snapshot", "created": created, "scanned": scanned}
