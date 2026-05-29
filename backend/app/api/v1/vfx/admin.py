"""Admin endpoints — 두 가지 인증 지원.

1. X-Admin-Token (worker 용 — 서버↔서버)
2. Hub Bearer JWT + admin/professor role (사용자 — Dashboard 의 [전체 수집] 등)
"""
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.models import CrawlRun, Item, ItemCategory
from app.models.user import User, UserRole, UserStatus
from app import run_state
from app.schemas.vfx.admin import CrawlResult, PendingItem, ScoreUpdate, ScoreUpdateResult
from app.jobs.code_linker import link_codes_for_arxiv_items
from app.jobs.crawler import SOURCE_LABELS, crawl_all, crawl_source
from app.jobs.grouper import group_items
from app.jobs.lineage_builder import build_lineage_for_new_items

router = APIRouter(prefix="/admin", tags=["admin"])

_bearer = HTTPBearer(auto_error=False)
ALGORITHM = "HS256"


async def verify_admin_token(
    x_admin_token: str | None = Header(default=None),
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)] = None,
    db: AsyncSession = Depends(get_db),
) -> None:
    """둘 중 하나면 통과:
    1) X-Admin-Token == settings.admin_token (worker)
    2) Authorization Bearer JWT 가 admin/professor 사용자 (Hub user)
    """
    # 1) Worker용 X-Admin-Token
    if x_admin_token and x_admin_token == settings.admin_token:
        return

    # 2) Hub user (admin / professor)
    if credentials is not None:
        try:
            payload = jwt.decode(credentials.credentials, settings.SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("sub")
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid token")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: missing subject")
        import uuid
        result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
        user = result.scalar_one_or_none()
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        if not settings.DEBUG and user.status != UserStatus.active:
            raise HTTPException(status_code=403, detail="Account not active")
        if user.role not in (UserRole.admin, UserRole.professor):
            raise HTTPException(status_code=403, detail="Admin/professor role required")
        return

    raise HTTPException(status_code=401, detail="Invalid admin token (X-Admin-Token or Bearer JWT 필요)")


@router.get("/pending-scoring", response_model=list[PendingItem])
async def pending_scoring(
    limit: int = Query(50, le=200),
    _: None = Depends(verify_admin_token),
    db: AsyncSession = Depends(get_db),
):
    """Items with llm_score=0 waiting for LLM scoring (AI Cluster Worker consumes this)."""
    stmt = (
        select(Item)
        .options(selectinload(Item.categories).selectinload(ItemCategory.category))
        .where(Item.llm_score == 0)
        .order_by(Item.discovered_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    items = result.scalars().unique().all()
    return [
        PendingItem(
            id=i.id,
            source=i.source,
            title=i.title,
            abstract=i.abstract,
            url=i.url,
            category_slugs=[ic.category.slug for ic in i.categories if ic.category],
        )
        for i in items
    ]


@router.post("/score-update", response_model=ScoreUpdateResult)
async def score_update(
    updates: list[ScoreUpdate],
    _: None = Depends(verify_admin_token),
    db: AsyncSession = Depends(get_db),
):
    """Apply LLM scoring results from AI Cluster Worker.

    Rich `analysis` payload (verdict/practical_value/lineage/translation/warning)
    from the Arca persona is stored in item_metadata.arca.
    """
    count = 0
    for u in updates:
        item = await db.get(Item, u.id)
        if not item:
            continue
        item.llm_score = u.llm_score
        if u.llm_reason:
            item.llm_reason = u.llm_reason[:4000]
        if u.priority:
            item.priority = u.priority

        if u.analysis:
            md = dict(item.item_metadata or {})
            md["arca"] = u.analysis
            item.item_metadata = md

            # brand 자동 추출 → free_tags 반영 (night_batch 경로와 정합).
            # 검색(search.py) + 카테고리 승격(step_detect_promotions) 자동 연동.
            from app.jobs.arca_brain import normalize_brand
            brand = normalize_brand(u.analysis.get("brand"))
            if brand:
                item.free_tags = sorted(set((item.free_tags or []) + [brand]))

        count += 1
    await db.commit()
    return ScoreUpdateResult(updated=count)


async def _wrap_run(action: str, label: str, fn, *args):
    """run_state begin/end 자동 처리. 실패해도 end() 항상 호출."""
    run_state.begin(action=action, label=label, stage="시작 중...")
    try:
        result = await fn(*args)
        run_state.end(result=result if isinstance(result, dict) else {"value": str(result)})
        return result
    except Exception as e:
        run_state.end(error=str(e)[:500])
        raise


@router.post("/crawl/{source}", response_model=CrawlResult)
async def trigger_crawl_source(
    source: str,
    background: BackgroundTasks,
    wait: bool = Query(False, description="wait=true means run synchronously"),
    _: None = Depends(verify_admin_token),
):
    """Trigger a single-source crawl. Default: fire-and-forget."""
    if source not in SOURCE_LABELS:
        raise HTTPException(status_code=400, detail=f"Unknown source: {source}")

    if wait:
        result = await _wrap_run(f"crawl:{source}", f"수집: {source}", crawl_source, source)
        return CrawlResult(**result)
    else:
        background.add_task(_wrap_run, f"crawl:{source}", f"수집: {source}", crawl_source, source)
        return CrawlResult(source=source)


@router.post("/crawl")
async def trigger_crawl_all(
    background: BackgroundTasks,
    _: None = Depends(verify_admin_token),
):
    """Trigger all sources (fire-and-forget)."""
    background.add_task(_wrap_run, "crawl_all", "전체 수집 (모든 소스)", crawl_all)
    return {"status": "started", "sources": SOURCE_LABELS}


@router.post("/link-codes")
async def trigger_link_codes(
    background: BackgroundTasks,
    max_items: int = Query(20, le=100),
    wait: bool = Query(False),
    _: None = Depends(verify_admin_token),
):
    """Scan recent arXiv items and attach matching GitHub repos."""
    if wait:
        total = await _wrap_run("link_codes", "코드 링크 (arxiv ↔ GitHub)", link_codes_for_arxiv_items, max_items)
        return {"status": "done", "links_added": total}
    background.add_task(_wrap_run, "link_codes", "코드 링크 (arxiv ↔ GitHub)", link_codes_for_arxiv_items, max_items)
    return {"status": "started"}


@router.post("/build-lineage")
async def trigger_build_lineage(
    background: BackgroundTasks,
    max_items: int = Query(20, le=100),
    wait: bool = Query(False),
    _: None = Depends(verify_admin_token),
):
    """Build lineage edges for arXiv items via Semantic Scholar."""
    if wait:
        total = await _wrap_run("build_lineage", "계보 빌드 (Semantic Scholar)", build_lineage_for_new_items, max_items)
        return {"status": "done", "edges_added": total}
    background.add_task(_wrap_run, "build_lineage", "계보 빌드 (Semantic Scholar)", build_lineage_for_new_items, max_items)
    return {"status": "started"}


@router.post("/group-items")
async def trigger_group_items(
    background: BackgroundTasks,
    wait: bool = Query(False),
    _: None = Depends(verify_admin_token),
):
    """Run the item grouper to unify same research across sources."""
    if wait:
        result = await _wrap_run("group_items", "아이템 그룹핑", group_items)
        return {"status": "done", **result}
    background.add_task(_wrap_run, "group_items", "아이템 그룹핑", group_items)
    return {"status": "started"}


@router.post("/night-batch")
async def trigger_night_batch(
    background: BackgroundTasks,
    wait: bool = Query(False),
    _: None = Depends(verify_admin_token),
):
    """Run the full night batch pipeline (submissions + grouper + promotions)."""
    from app.jobs.night_batch import run_night_batch

    if wait:
        results = await _wrap_run("night_batch", "야간 배치 (Gemma 분석)", run_night_batch)
        return {"status": "done", "results": results}
    background.add_task(_wrap_run, "night_batch", "야간 배치 (Gemma 분석)", run_night_batch)
    return {"status": "started"}


@router.get("/run-status")
async def get_run_status(_: None = Depends(verify_admin_token)):
    """현재 진행 중인 background 작업 상태. RunStatusBar 가 폴링.

    응답 예:
    {
      "is_running": true,
      "action": "night_batch",
      "label": "야간 배치 (Gemma 분석)",
      "stage": "Step 3: Scoring",
      "detail": "12/28 scored",
      "progress": 0.43,
      "started_at": "2026-05-07T12:34:56Z",
      "finished_at": null,
      "result": null,
      "error": null
    }
    """
    return run_state.snapshot()


@router.get("/runs")
async def list_runs(
    limit: int = Query(20, le=100),
    _: None = Depends(verify_admin_token),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(CrawlRun).order_by(CrawlRun.started_at.desc()).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": r.id,
            "source": r.source,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "finished_at": r.finished_at.isoformat() if r.finished_at else None,
            "items_found": r.items_found,
            "items_new": r.items_new,
            "error": r.error,
        }
        for r in rows
    ]
