from fastapi import APIRouter

from app.api.v1 import auth, users, projects, tasks, tags, comments, daily, events, weekly_notes, uploads, attachments, attendance, notifications, admin, sota, reports, gcal, announcements, push, feed, annotations

# === VFX SOTA Monitor 라우터 (vfx-sota-monitor 흡수) ===
from app.api.v1.vfx import (
    admin as vfx_admin,
    categories as vfx_categories,
    comments as vfx_comments,
    feed as vfx_feed,
    items as vfx_items,
    lineage as vfx_lineage,
    ontology as vfx_ontology,
    search as vfx_search,
    stats as vfx_stats,
    submissions as vfx_submissions,
    tags as vfx_tags,
)

api_router = APIRouter()

# === Hub 기존 라우터 ===
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(tasks.router, tags=["tasks"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(tags.router, prefix="/tags", tags=["tags"])
api_router.include_router(comments.router, tags=["comments"])
api_router.include_router(daily.router, prefix="/daily-logs", tags=["daily"])
api_router.include_router(daily.block_router, prefix="/daily-blocks", tags=["daily"])
api_router.include_router(events.router, prefix="/events", tags=["events"])
api_router.include_router(weekly_notes.router, prefix="/weekly-notes", tags=["weekly-notes"])
api_router.include_router(uploads.router, prefix="/uploads", tags=["uploads"])
api_router.include_router(attachments.router, prefix="/attachments", tags=["attachments"])  # Phase 2.5 — 미디어
api_router.include_router(annotations.router)  # Phase 2.5 B — 주석 (절대경로: /attachments/{id}/annotations, /annotations/{id})
api_router.include_router(attendance.router, prefix="/attendance", tags=["attendance"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(sota.router, prefix="/sota", tags=["sota"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(gcal.router)
api_router.include_router(announcements.router, prefix="/announcements", tags=["announcements"])
api_router.include_router(push.router, prefix="/push", tags=["push"])
api_router.include_router(feed.router, prefix="/feed", tags=["feed"])

# === VFX SOTA Monitor 라우터 (모두 /vfx prefix) ===
# 라우터 자체가 /items, /categories 등 prefix 가짐 → 최종 경로: /api/v1/vfx/items, /api/v1/vfx/categories ...
api_router.include_router(vfx_categories.router, prefix="/vfx", tags=["vfx-categories"])
api_router.include_router(vfx_items.router, prefix="/vfx", tags=["vfx-items"])
api_router.include_router(vfx_comments.router, prefix="/vfx", tags=["vfx-comments"])
api_router.include_router(vfx_search.router, prefix="/vfx", tags=["vfx-search"])
api_router.include_router(vfx_stats.router, prefix="/vfx", tags=["vfx-stats"])
api_router.include_router(vfx_lineage.router, prefix="/vfx", tags=["vfx-lineage"])
api_router.include_router(vfx_ontology.router, prefix="/vfx", tags=["vfx-ontology"])
api_router.include_router(vfx_feed.router, prefix="/vfx", tags=["vfx-feed"])
api_router.include_router(vfx_submissions.router, prefix="/vfx", tags=["vfx-submissions"])
api_router.include_router(vfx_tags.router, prefix="/vfx", tags=["vfx-tags"])
api_router.include_router(vfx_admin.router, prefix="/vfx", tags=["vfx-admin"])
