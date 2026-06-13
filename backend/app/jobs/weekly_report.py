"""주간 연구 리포트 (Karpathy outputs tier).

한 주의 연구 활동(모델연결 데일리 + 리뷰 + 컨펌 + 신규 모델)을 집계하고,
Arca(Gemma)가 산문 요약을 작성 → ReportSnapshot(organization_summary)으로 저장.
Gemma 미연결(dev) 시 집계는 그대로 저장하고 요약만 placeholder.
"""
import asyncio
import logging
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.daily import DailyBlock, DailyLog
from app.models.report import ReportScopeType, ReportSnapshot, ReportType
from app.models.sota import SotaAssignment, SotaReview
from app.models.user import User
from app.models.vfx_comment import ItemComment
from app.models.vfx_item import Item

logger = logging.getLogger(__name__)

_SUMMARY_SYSTEM = (
    "너는 VFX 연구실의 주간 연구 동향 정리 담당이다. 주어진 집계(JSON)를 바탕으로 "
    "한국어로 5~8문장의 간결한 주간 요약을 써라. 어떤 모델/분야에 활동이 몰렸는지, "
    "누가 무엇을 검토·컨펌했는지, 다음 주 주목할 점을 담아라. 과장 없이 사실 기반으로."
)


def _dt_range(period_start: date, period_end: date) -> tuple[datetime, datetime]:
    start = datetime.combine(period_start, time.min, tzinfo=timezone.utc)
    end = datetime.combine(period_end + timedelta(days=1), time.min, tzinfo=timezone.utc)
    return start, end


async def _aggregate(db: AsyncSession, start: datetime, end: datetime) -> dict:
    # 신규 모델
    new_models = (await db.execute(
        select(Item.id, Item.title)
        .where(Item.discovered_at >= start, Item.discovered_at < end)
        .order_by(Item.discovered_at.desc()).limit(50)
    )).all()

    # 모델 연결 데일리 블록 (학생별 카운트)
    daily_rows = (await db.execute(
        select(User.name, func.count(DailyBlock.id))
        .join(DailyLog, DailyBlock.daily_log_id == DailyLog.id)
        .join(User, DailyLog.author_id == User.id)
        .where(DailyBlock.sota_item_id.isnot(None),
               DailyBlock.created_at >= start, DailyBlock.created_at < end)
        .group_by(User.name)
    )).all()

    # 리뷰 제출 (모델별)
    review_rows = (await db.execute(
        select(Item.title, func.count(SotaReview.id))
        .join(SotaAssignment, SotaReview.sota_assignment_id == SotaAssignment.id)
        .join(Item, SotaAssignment.sota_item_id == Item.id)
        .where(SotaReview.submitted_at >= start, SotaReview.submitted_at < end)
        .group_by(Item.title)
    )).all()

    # 컨펌 (ItemComment kind=confirm)
    confirms = (await db.execute(
        select(ItemComment.user_name, Item.title)
        .join(Item, ItemComment.item_id == Item.id)
        .where(ItemComment.kind == "confirm",
               ItemComment.created_at >= start, ItemComment.created_at < end)
        .limit(50)
    )).all()

    return {
        "new_models": [{"id": i, "title": t} for i, t in new_models],
        "daily_by_student": [{"student": n, "blocks": c} for n, c in daily_rows],
        "reviews_by_model": [{"model": t, "reviews": c} for t, c in review_rows],
        "confirms": [{"by": u, "model": t} for u, t in confirms],
        "totals": {
            "new_models": len(new_models),
            "daily_blocks": sum(c for _, c in daily_rows),
            "reviews": sum(c for _, c in review_rows),
            "confirms": len(confirms),
        },
    }


async def generate_research_weekly(
    db: AsyncSession,
    period_start: date,
    period_end: date,
    generated_by=None,
) -> ReportSnapshot:
    """주간 연구 리포트 1건 생성·저장 후 반환."""
    start, end = _dt_range(period_start, period_end)
    agg = await _aggregate(db, start, end)

    # Arca 요약 (Gemma) — 동기 httpx 라 to_thread. 실패 시 placeholder.
    summary = ""
    try:
        from app.jobs.arca_brain import _call_gemma
        import json
        summary = await asyncio.to_thread(
            _call_gemma, _SUMMARY_SYSTEM, json.dumps(agg, ensure_ascii=False), 0.3, 1200, False
        )
    except Exception as e:  # noqa: BLE001
        logger.warning(f"weekly summary Gemma 실패: {type(e).__name__}: {e}")
    if not summary:
        summary = "(Arca 요약 미생성 — Ollama/Gemma 연결 시 자동 작성. 아래 집계 참고.)"
    agg["summary"] = summary

    snap = ReportSnapshot(
        report_type=ReportType.organization_summary,
        title=f"주간 연구 리포트 {period_start.isoformat()} ~ {period_end.isoformat()}",
        scope_type=ReportScopeType.organization,
        period_start=period_start,
        period_end=period_end,
        content=agg,
        generated_by=generated_by,
    )
    db.add(snap)
    await db.commit()
    await db.refresh(snap)
    logger.info(f"[weekly_report] {snap.title} — totals={agg['totals']}")
    return snap


async def run_weekly_report() -> None:
    """스케줄러 진입점 — 지난 7일(어제까지) 연구 리포트 생성."""
    from app.database import SessionLocal
    today = datetime.now(timezone.utc).date()
    period_end = today - timedelta(days=1)
    period_start = period_end - timedelta(days=6)
    async with SessionLocal() as db:
        await generate_research_weekly(db, period_start, period_end)
