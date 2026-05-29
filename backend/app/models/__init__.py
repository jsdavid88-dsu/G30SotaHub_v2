from app.models.base import Base
from app.models.user import User, AdvisorRelation, UserRole, UserStatus
from app.models.project import Project, ProjectMember, ProjectStatus, ProjectMemberRole, ProjectType
from app.models.task import Task, TaskAssignee, TaskGroup, TaskGroupStatus, TaskStatus, TaskPriority
from app.models.daily import DailyLog, DailyBlock, DailyBlockTag, BlockSection, BlockVisibility
from app.models.tag import Tag, TagScopeType
from app.models.comment import Comment
from app.models.attendance import Attendance, AttendanceType
from app.models.attachment import Attachment, AttachmentOwnerType
from app.models.event import Event, EventParticipant, EventType, EventSource
from app.models.notification import Notification, NotificationType
from app.models.audit import AuditLog
# === SOTA 통합 (Phase 1, 2026-05-07) ===
# Hub SotaItem class → vfx_item.Item 으로 흡수
# SotaAssignment / SotaReview 는 유지 (sota_item_id: int FK to items.id)
from app.models.sota import SotaAssignment, SotaReview, SotaAssignmentStatus
from app.models.report import ReportSnapshot, ReportType, ReportScopeType
from app.models.announcement import Announcement, AnnouncementRead, AnnouncementAudience
from app.models.push_subscription import PushSubscription
from app.models.project_message import ProjectMessage
from app.models.annotation import Annotation, AnnotationReply

# === VFX SOTA Monitor (Phase 1: 통합 모델) ===
from app.models.vfx_category import Category
from app.models.vfx_item import Item, ItemCategory, SotaItem, LifecycleStatus, ConfidenceStatus
from app.models.vfx_item_group import ItemGroup
from app.models.vfx_lineage import LineageEdge
from app.models.vfx_comment import ItemComment
from app.models.vfx_crawl_run import CrawlRun
from app.models.vfx_feed_item import FeedItem
from app.models.vfx_submission import Submission
from app.models.vfx_category_suggestion import CategorySuggestion

__all__ = [
    "Base",
    # User
    "User", "AdvisorRelation", "UserRole", "UserStatus",
    # Project
    "Project", "ProjectMember", "ProjectStatus", "ProjectMemberRole", "ProjectType",
    # Task
    "Task", "TaskAssignee", "TaskGroup", "TaskGroupStatus", "TaskStatus", "TaskPriority",
    # Daily
    "DailyLog", "DailyBlock", "DailyBlockTag", "BlockSection", "BlockVisibility",
    # Tag
    "Tag", "TagScopeType",
    # Comment (Hub: daily_blocks 댓글)
    "Comment",
    # Attendance
    "Attendance", "AttendanceType",
    # Attachment
    "Attachment", "AttachmentOwnerType",
    # Event
    "Event", "EventParticipant", "EventType", "EventSource",
    # Notification
    "Notification", "NotificationType",
    # Audit
    "AuditLog",
    # SOTA Assignment system (Hub)
    "SotaAssignment", "SotaReview", "SotaAssignmentStatus",
    # Report
    "ReportSnapshot", "ReportType", "ReportScopeType",
    # Announcement
    "Announcement", "AnnouncementRead", "AnnouncementAudience",
    # PushSubscription
    "PushSubscription",
    # ProjectMessage (Phase 2 — 프로젝트 메시지 보드)
    "ProjectMessage",
    # Annotation (Phase 2.5 B/C — 이미지/영상 주석)
    "Annotation", "AnnotationReply",
    # === SOTA Item (통합 — Hub SotaItem 흡수, VFX 자동 수집 + 수동 등록 모두) ===
    "Category",
    "Item",          # 통합 모델 (table: items)
    "SotaItem",      # alias for Item (호환성)
    "ItemCategory",
    "LifecycleStatus", "ConfidenceStatus",
    "ItemGroup",
    "LineageEdge",
    "ItemComment",
    "CrawlRun",
    "FeedItem",
    "Submission",
    "CategorySuggestion",
]
