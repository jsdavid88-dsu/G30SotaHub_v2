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
from app.models.sota import SotaItem, SotaAssignment, SotaReview, SotaAssignmentStatus
from app.models.report import ReportSnapshot, ReportType, ReportScopeType
from app.models.announcement import Announcement, AnnouncementRead, AnnouncementAudience
from app.models.push_subscription import PushSubscription

# === VFX SOTA Monitor 흡수 (vfx-sota-monitor) ===
from app.models.vfx_category import Category
from app.models.vfx_item import Item, ItemCategory
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
    # SOTA (Hub: 학생 배정용)
    "SotaItem", "SotaAssignment", "SotaReview", "SotaAssignmentStatus",
    # Report
    "ReportSnapshot", "ReportType", "ReportScopeType",
    # Announcement
    "Announcement", "AnnouncementRead", "AnnouncementAudience",
    # PushSubscription
    "PushSubscription",
    # === VFX SOTA Monitor (vfx-sota-monitor 흡수) ===
    "Category",
    "Item", "ItemCategory",
    "ItemGroup",
    "LineageEdge",
    "ItemComment",
    "CrawlRun",
    "FeedItem",
    "Submission",
    "CategorySuggestion",
]
