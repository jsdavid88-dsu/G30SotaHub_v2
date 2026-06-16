"""LDR 수동 연구 큐 CRUD + 야간 큐 미리보기 (#11 후속).

운영진(admin/professor)이 "리서치해줘" 토픽을 쌓는다. 야간배치 step 0.7 의
build_nightbatch_queries 가 이 active 항목 + 분야자동 + dangling + config 를 합쳐 LDR 에 던짐.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_role
from app.models import LdrResearchQuery
from app.models.user import User, UserRole

router = APIRouter(prefix="/ldr-queue", tags=["vfx-ldr"])
_PRIV = require_role(UserRole.admin, UserRole.professor)


class LdrQueryCreate(BaseModel):
    query: str
    note: str | None = None


class LdrQueryPatch(BaseModel):
    active: bool | None = None
    query: str | None = None
    note: str | None = None


def _row(r: LdrResearchQuery) -> dict:
    return {
        "id": r.id, "query": r.query, "note": r.note, "active": r.active,
        "last_run_at": r.last_run_at.isoformat() if r.last_run_at else None,
        "run_count": r.run_count,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("/preview")
async def preview_queries(db: AsyncSession = Depends(get_db), _u: User = Depends(_PRIV)):
    """오늘 야간배치가 LDR 에 던질 합성 질의 미리보기 (수동+dangling+분야+config, cap 적용)."""
    from app.jobs.deep_research import build_nightbatch_queries
    queries, used_manual = await build_nightbatch_queries(db)
    return {"queries": queries, "manual_used": len(used_manual), "total": len(queries)}


@router.get("")
async def list_queue(db: AsyncSession = Depends(get_db), _u: User = Depends(_PRIV)):
    rows = (await db.execute(
        select(LdrResearchQuery).order_by(LdrResearchQuery.created_at.desc())
    )).scalars().all()
    return [_row(r) for r in rows]


@router.post("", status_code=201)
async def add_query(body: LdrQueryCreate, db: AsyncSession = Depends(get_db), user: User = Depends(_PRIV)):
    q = (body.query or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="query 가 비어있습니다.")
    row = LdrResearchQuery(query=q[:500], note=(body.note or None), created_by=user.id)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _row(row)


@router.patch("/{qid}")
async def patch_query(qid: int, body: LdrQueryPatch, db: AsyncSession = Depends(get_db), _u: User = Depends(_PRIV)):
    row = await db.get(LdrResearchQuery, qid)
    if not row:
        raise HTTPException(status_code=404, detail="없는 항목")
    if body.active is not None:
        row.active = body.active
    if body.query is not None and body.query.strip():
        row.query = body.query.strip()[:500]
    if body.note is not None:
        row.note = body.note or None
    await db.commit()
    await db.refresh(row)
    return _row(row)


@router.delete("/{qid}", status_code=204)
async def delete_query(qid: int, db: AsyncSession = Depends(get_db), _u: User = Depends(_PRIV)):
    row = await db.get(LdrResearchQuery, qid)
    if row:
        await db.delete(row)
        await db.commit()
