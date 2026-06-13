"""APScheduler setup — daytime crawl + night batch (crawl + Gemma4 analysis).

Schedule:
  09:00 KST — 가벼운 크롤 (arxiv/github/hf/reddit, 키워드 스코어링만)
  12:00, 18:00 KST — 피드 크롤 (YouTube/HF trending/Reddit)
  21:00 KST — 야간 풀 배치:
    0. 전체 크롤 (모든 소스 재수집)
    1. 제보 처리
    2. Gemma4 피드 필터링
    3. Gemma4 스코어링
    4. 그룹핑
    5. Gemma4 카테고리 승격 감지
"""
from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.jobs.crawler import crawl_all
from app.jobs.feed_crawler import crawl_feed_all
from app.jobs.night_batch import run_night_batch
from app.jobs.weekly_report import run_weekly_report

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


def start_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler and _scheduler.running:
        return _scheduler

    _scheduler = AsyncIOScheduler(timezone="Asia/Seoul")

    # 낮 크롤 — 09:00 KST (가벼운 수집만, Gemma 안 씀)
    _scheduler.add_job(
        crawl_all,
        trigger=CronTrigger(hour=9, minute=0),
        id="morning_research_crawl",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    # 피드 크롤 — 12:00, 18:00 KST (YouTube/HF/Reddit)
    _scheduler.add_job(
        crawl_feed_all,
        trigger=CronTrigger(hour="12,18", minute=0),
        id="daytime_feed_crawl",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    # 야간 풀 배치 — 21:00 KST (크롤 + Gemma4 분석 전부)
    _scheduler.add_job(
        run_night_batch,
        trigger=CronTrigger(hour=21, minute=0),
        id="night_batch",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    # 주간 연구 리포트 — 월요일 08:00 KST (지난 7일 outputs tier 요약)
    _scheduler.add_job(
        run_weekly_report,
        trigger=CronTrigger(day_of_week="mon", hour=8, minute=0),
        id="weekly_research_report",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )

    _scheduler.start()
    logger.info(
        "Scheduler started — morning crawl: 09:00, feed: 12:00/18:00, night batch: 21:00, "
        "weekly report: Mon 08:00 KST"
    )
    return _scheduler


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("Scheduler stopped")
