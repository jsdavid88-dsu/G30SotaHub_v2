"""Ontology endpoints — Karpathy 3-ops 중 Lint(on-demand) + raw tier 조회.

- POST /vfx/ontology/lint                 : Lint 실행(admin/professor) → 위생 점검 리포트
- GET  /vfx/ontology/items/{id}/raw       : 해당 item 의 raw 원본 스냅샷 이력(provenance)
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.vfx.admin import verify_admin_token
from app.database import get_db
from app.dependencies import get_current_user
from app.jobs.lint import run_lint
from app.models import ModelRawSnapshot
from app.models.user import User

router = APIRouter(prefix="/ontology", tags=["vfx-ontology"])


@router.post("/lint")
async def run_ontology_lint(
    auto_tag_stale: bool = True,
    _auth: None = Depends(verify_admin_token),
):
    """온톨로지 위생 점검(admin/professor). stale 자동 태깅 + orphan/dangling/contradiction/dup 보고."""
    return await run_lint(auto_tag_stale=auto_tag_stale)


@router.get("/items/{item_id}/raw")
async def get_item_raw_snapshots(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """해당 item 의 raw 원본 스냅샷 이력(최신순) — Karpathy raw tier provenance."""
    rows = (
        await db.execute(
            select(ModelRawSnapshot)
            .where(ModelRawSnapshot.item_id == item_id)
            .order_by(ModelRawSnapshot.fetched_at.desc())
        )
    ).scalars().all()
    return [
        {
            "id": s.id,
            "source": s.source,
            "external_id": s.external_id,
            "raw_title": s.raw_title,
            "raw_abstract": s.raw_abstract,
            "raw_authors": s.raw_authors,
            "raw_url": s.raw_url,
            "raw_metadata": s.raw_metadata,
            "content_hash": s.content_hash,
            "fetched_at": s.fetched_at.isoformat() if s.fetched_at else None,
        }
        for s in rows
    ]
