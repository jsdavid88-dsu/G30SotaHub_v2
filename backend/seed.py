"""Seed script: creates test users and sample data for development."""
import asyncio
import uuid
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select, text

from app.database import async_session
from app.models.daily import (
    BlockSection,
    BlockVisibility,
    DailyBlock,
    DailyBlockTag,
    DailyLog,
)
from app.models.event import Event, EventParticipant, EventType, EventSource
from app.models.notification import Notification, NotificationType
from app.models.project import Project, ProjectMember, ProjectMemberRole, ProjectStatus
from app.models.tag import Tag, TagScopeType
from app.models.task import Task, TaskAssignee, TaskPriority, TaskStatus
from app.models.user import AdvisorRelation, User, UserRole, UserStatus
from app.models.attendance import Attendance, AttendanceType

# ─── Fixed UUIDs ──────────────────────────────────────────────────────────────
ADMIN_ID = uuid.UUID("00000000-0000-0000-0000-000000000000")
PROF_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
STUDENT1_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")
STUDENT2_ID = uuid.UUID("00000000-0000-0000-0000-000000000003")
STUDENT3_ID = uuid.UUID("00000000-0000-0000-0000-000000000004")
EXTERNAL_ID = uuid.UUID("00000000-0000-0000-0000-000000000005")

PROJECT1_ID = uuid.UUID("00000000-0000-0000-0000-000000000010")
PROJECT2_ID = uuid.UUID("00000000-0000-0000-0000-000000000011")

TASK_IDS = [uuid.UUID(f"00000000-0000-0000-0000-0000000001{i:02d}") for i in range(20)]
DAILY_LOG_IDS = [uuid.UUID(f"00000000-0000-0000-0000-0000000002{i:02d}") for i in range(20)]
DAILY_BLOCK_IDS = [uuid.UUID(f"00000000-0000-0000-0000-0000000003{i:02d}") for i in range(60)]
TAG_IDS = [uuid.UUID(f"00000000-0000-0000-0000-0000000004{i:02d}") for i in range(10)]
EVENT_IDS = [uuid.UUID(f"00000000-0000-0000-0000-0000000005{i:02d}") for i in range(20)]
NOTIF_IDS = [uuid.UUID(f"00000000-0000-0000-0000-0000000006{i:02d}") for i in range(10)]

KST = timezone(timedelta(hours=9))


def kst_dt(y, m, d, h=0, mi=0):
    return datetime(y, m, d, h, mi, tzinfo=KST)


async def reset_and_seed():
    async with async_session() as db:
        # ── FULL RESET ────────────────────────────────────────────────────
        tables = [
            "notifications", "event_participants", "events",
            "comments", "daily_block_tags", "daily_blocks", "daily_logs",
            "task_assignees", "tasks", "attendance",
            "report_snapshots", "sota_reviews", "sota_assignments", "sota_items",
            "attachments", "audit_logs",
            "project_members", "advisor_relations",
            "tags", "projects", "users",
        ]
        for t in tables:
            await db.execute(text(f"DELETE FROM {t}"))
        await db.flush()
        print("All tables cleared.")

        # ── Users ─────────────────────────────────────────────────────────
        users = [
            User(id=ADMIN_ID, email="admin@test.com", name="관리자",
                 role=UserRole.admin, status=UserStatus.active,
                 google_subject="google_admin_001"),
            User(id=PROF_ID, email="professor@test.com", name="김교수",
                 role=UserRole.professor, status=UserStatus.active,
                 major_field="컴퓨터공학", google_subject="google_prof_001"),
            User(id=STUDENT1_ID, email="student1@test.com", name="이학생",
                 role=UserRole.student, status=UserStatus.active,
                 major_field="컴퓨터공학", google_subject="google_stu_001"),
            User(id=STUDENT2_ID, email="student2@test.com", name="박학생",
                 role=UserRole.student, status=UserStatus.active,
                 major_field="인공지능", google_subject="google_stu_002"),
            User(id=STUDENT3_ID, email="student3@test.com", name="최학생",
                 role=UserRole.student, status=UserStatus.active,
                 major_field="데이터사이언스", google_subject="google_stu_003"),
            User(id=EXTERNAL_ID, email="external@company.com", name="외부파트너",
                 role=UserRole.external, status=UserStatus.active,
                 company="테크컴퍼니", google_subject="google_ext_001"),
        ]
        db.add_all(users)
        await db.flush()

        # ── Advisor relations ─────────────────────────────────────────────
        db.add_all([
            AdvisorRelation(professor_id=PROF_ID, student_id=STUDENT1_ID),
            AdvisorRelation(professor_id=PROF_ID, student_id=STUDENT2_ID),
            AdvisorRelation(professor_id=PROF_ID, student_id=STUDENT3_ID),
        ])
        await db.flush()

        # ── Projects ──────────────────────────────────────────────────────
        db.add_all([
            Project(id=PROJECT1_ID, name="KOCCA AI 애니메이션 파이프라인",
                    description="AI 기반 애니메이션 제작 파이프라인 연구",
                    status=ProjectStatus.active, created_by=PROF_ID,
                    start_date=date(2026, 1, 6), end_date=date(2026, 12, 31)),
            Project(id=PROJECT2_ID, name="NRF GCA 서사학 연구",
                    description="글로벌 서사학 연구 프로젝트",
                    status=ProjectStatus.active, created_by=PROF_ID,
                    start_date=date(2026, 3, 1), end_date=date(2026, 8, 31)),
        ])
        await db.flush()

        # ── Project members ───────────────────────────────────────────────
        db.add_all([
            ProjectMember(project_id=PROJECT1_ID, user_id=PROF_ID, project_role=ProjectMemberRole.lead),
            ProjectMember(project_id=PROJECT1_ID, user_id=STUDENT1_ID, project_role=ProjectMemberRole.member),
            ProjectMember(project_id=PROJECT1_ID, user_id=STUDENT2_ID, project_role=ProjectMemberRole.member),
            ProjectMember(project_id=PROJECT1_ID, user_id=EXTERNAL_ID, project_role=ProjectMemberRole.viewer),
            ProjectMember(project_id=PROJECT2_ID, user_id=PROF_ID, project_role=ProjectMemberRole.lead),
            ProjectMember(project_id=PROJECT2_ID, user_id=STUDENT2_ID, project_role=ProjectMemberRole.member),
            ProjectMember(project_id=PROJECT2_ID, user_id=STUDENT3_ID, project_role=ProjectMemberRole.member),
        ])
        await db.flush()

        # ── Tags ──────────────────────────────────────────────────────────
        tags = [
            Tag(id=TAG_IDS[0], name="AI/ML", color="#3B82F6", scope_type=TagScopeType.global_),
            Tag(id=TAG_IDS[1], name="Diffusion", color="#8B5CF6", scope_type=TagScopeType.global_),
            Tag(id=TAG_IDS[2], name="논문리뷰", color="#F59E0B", scope_type=TagScopeType.global_),
            Tag(id=TAG_IDS[3], name="인프라", color="#EF4444", scope_type=TagScopeType.global_),
            Tag(id=TAG_IDS[4], name="Animation", color="#10B981", scope_type=TagScopeType.project,
                project_id=PROJECT1_ID),
            Tag(id=TAG_IDS[5], name="NLP", color="#06B6D4", scope_type=TagScopeType.project,
                project_id=PROJECT2_ID),
            Tag(id=TAG_IDS[6], name="Pipeline", color="#F97316", scope_type=TagScopeType.global_),
            Tag(id=TAG_IDS[7], name="서사학", color="#EC4899", scope_type=TagScopeType.project,
                project_id=PROJECT2_ID),
        ]
        db.add_all(tags)
        await db.flush()

        # ── Tasks ─────────────────────────────────────────────────────────
        tasks = [
            # KOCCA 프로젝트 태스크
            Task(id=TASK_IDS[0], project_id=PROJECT1_ID, title="Diffusion 모델 v2 학습",
                 description="StyleGAN3 대비 FID 비교 실험", status=TaskStatus.in_progress,
                 priority=TaskPriority.high, due_date=date(2026, 3, 14), created_by=PROF_ID),
            Task(id=TASK_IDS[1], project_id=PROJECT1_ID, title="캐릭터 모션 리타겟팅",
                 description="Blender 연동 파이프라인 구축", status=TaskStatus.todo,
                 priority=TaskPriority.high, due_date=date(2026, 3, 18), created_by=PROF_ID),
            Task(id=TASK_IDS[2], project_id=PROJECT1_ID, title="데이터 전처리 파이프라인 개선",
                 description="배치 처리 속도 최적화", status=TaskStatus.done,
                 priority=TaskPriority.medium, due_date=date(2026, 3, 10), created_by=PROF_ID),
            Task(id=TASK_IDS[3], project_id=PROJECT1_ID, title="GAN vs Diffusion 비교 실험",
                 description="FID/IS 지표 기반 정량 비교", status=TaskStatus.in_progress,
                 priority=TaskPriority.medium, due_date=date(2026, 3, 20), created_by=PROF_ID),
            Task(id=TASK_IDS[4], project_id=PROJECT1_ID, title="GPU 서버 OOM 이슈 해결",
                 description="A100 80GB 메모리 최적화", status=TaskStatus.blocked,
                 priority=TaskPriority.high, due_date=date(2026, 3, 13), created_by=PROF_ID),
            # NRF 프로젝트 태스크
            Task(id=TASK_IDS[5], project_id=PROJECT2_ID, title="서사 구조 분석 알고리즘 논문",
                 description="GCA 프레임워크 Section 3 초안", status=TaskStatus.in_progress,
                 priority=TaskPriority.high, due_date=date(2026, 3, 15), created_by=PROF_ID),
            Task(id=TASK_IDS[6], project_id=PROJECT2_ID, title="한국서사학회 발표자료",
                 description="3/20 학회 발표 준비", status=TaskStatus.todo,
                 priority=TaskPriority.high, due_date=date(2026, 3, 19), created_by=PROF_ID),
            Task(id=TASK_IDS[7], project_id=PROJECT2_ID, title="코퍼스 데이터 수집",
                 description="한국 현대소설 200편 디지털화", status=TaskStatus.done,
                 priority=TaskPriority.medium, due_date=date(2026, 3, 7), created_by=PROF_ID),
            Task(id=TASK_IDS[8], project_id=PROJECT2_ID, title="실험 결과 시각화",
                 description="matplotlib + seaborn 그래프 생성", status=TaskStatus.in_progress,
                 priority=TaskPriority.medium, due_date=date(2026, 3, 17), created_by=PROF_ID),
            Task(id=TASK_IDS[9], project_id=PROJECT2_ID, title="NRF 연차보고서 초안",
                 description="1차 년도 성과 정리", status=TaskStatus.todo,
                 priority=TaskPriority.high, due_date=date(2026, 3, 20), created_by=PROF_ID),
        ]
        db.add_all(tasks)
        await db.flush()

        # ── Task Assignees ────────────────────────────────────────────────
        db.add_all([
            TaskAssignee(task_id=TASK_IDS[0], user_id=STUDENT1_ID, assigned_by=PROF_ID, is_primary=True),
            TaskAssignee(task_id=TASK_IDS[1], user_id=STUDENT1_ID, assigned_by=PROF_ID, is_primary=True),
            TaskAssignee(task_id=TASK_IDS[2], user_id=STUDENT2_ID, assigned_by=PROF_ID, is_primary=True),
            TaskAssignee(task_id=TASK_IDS[3], user_id=STUDENT1_ID, assigned_by=PROF_ID, is_primary=True),
            TaskAssignee(task_id=TASK_IDS[3], user_id=STUDENT2_ID, assigned_by=PROF_ID, is_primary=False),
            TaskAssignee(task_id=TASK_IDS[4], user_id=STUDENT1_ID, assigned_by=PROF_ID, is_primary=True),
            TaskAssignee(task_id=TASK_IDS[5], user_id=STUDENT2_ID, assigned_by=PROF_ID, is_primary=True),
            TaskAssignee(task_id=TASK_IDS[6], user_id=STUDENT2_ID, assigned_by=PROF_ID, is_primary=True),
            TaskAssignee(task_id=TASK_IDS[6], user_id=STUDENT3_ID, assigned_by=PROF_ID, is_primary=False),
            TaskAssignee(task_id=TASK_IDS[7], user_id=STUDENT3_ID, assigned_by=PROF_ID, is_primary=True),
            TaskAssignee(task_id=TASK_IDS[8], user_id=STUDENT2_ID, assigned_by=PROF_ID, is_primary=True),
            TaskAssignee(task_id=TASK_IDS[9], user_id=STUDENT3_ID, assigned_by=PROF_ID, is_primary=True),
        ])
        await db.flush()

        # ── Daily Logs + Blocks ───────────────────────────────────────────
        # 이학생 3/11
        db.add(DailyLog(id=DAILY_LOG_IDS[0], author_id=STUDENT1_ID, date=date(2026, 3, 11)))
        await db.flush()
        db.add_all([
            DailyBlock(id=DAILY_BLOCK_IDS[0], daily_log_id=DAILY_LOG_IDS[0], block_order=0,
                       content="Diffusion 모델 기반 캐릭터 생성 모듈 v2 학습 완료. FID 스코어 기존 대비 15% 개선 확인.",
                       section=BlockSection.yesterday, project_id=PROJECT1_ID,
                       visibility=BlockVisibility.project),
            DailyBlock(id=DAILY_BLOCK_IDS[1], daily_log_id=DAILY_LOG_IDS[0], block_order=1,
                       content="생성된 캐릭터의 모션 리타겟팅 파이프라인 테스트. Blender 연동 스크립트 작성 예정.",
                       section=BlockSection.today, project_id=PROJECT1_ID,
                       visibility=BlockVisibility.project),
            DailyBlock(id=DAILY_BLOCK_IDS[2], daily_log_id=DAILY_LOG_IDS[0], block_order=2,
                       content="GPU 서버 메모리 부족 이슈 - A100 80GB에서도 batch size 4 이상 OOM 발생. 모델 경량화 검토 필요.",
                       section=BlockSection.issue, project_id=PROJECT1_ID,
                       visibility=BlockVisibility.internal),
        ])
        await db.flush()

        # 이학생 3/12
        db.add(DailyLog(id=DAILY_LOG_IDS[1], author_id=STUDENT1_ID, date=date(2026, 3, 12)))
        await db.flush()
        db.add_all([
            DailyBlock(id=DAILY_BLOCK_IDS[3], daily_log_id=DAILY_LOG_IDS[1], block_order=0,
                       content="Blender Python API 연동 스크립트 초안 작성 완료. 캐릭터 본 구조 매핑 테스트.",
                       section=BlockSection.yesterday, project_id=PROJECT1_ID,
                       visibility=BlockVisibility.project),
            DailyBlock(id=DAILY_BLOCK_IDS[4], daily_log_id=DAILY_LOG_IDS[1], block_order=1,
                       content="GAN vs Diffusion 비교 실험 세팅. CIFAR-10, CelebA-HQ 데이터셋 준비.",
                       section=BlockSection.today, project_id=PROJECT1_ID,
                       visibility=BlockVisibility.project),
        ])
        await db.flush()

        # 이학생 3/13
        db.add(DailyLog(id=DAILY_LOG_IDS[2], author_id=STUDENT1_ID, date=date(2026, 3, 13)))
        await db.flush()
        db.add_all([
            DailyBlock(id=DAILY_BLOCK_IDS[5], daily_log_id=DAILY_LOG_IDS[2], block_order=0,
                       content="GAN 학습 시작 (StyleGAN3, 256x256). 예상 학습 시간 12시간.",
                       section=BlockSection.yesterday, project_id=PROJECT1_ID,
                       visibility=BlockVisibility.project),
            DailyBlock(id=DAILY_BLOCK_IDS[6], daily_log_id=DAILY_LOG_IDS[2], block_order=1,
                       content="Diffusion 모델도 동일 조건으로 학습. FID/IS 비교 예정.",
                       section=BlockSection.today, project_id=PROJECT1_ID,
                       visibility=BlockVisibility.project),
        ])
        await db.flush()

        # 박학생 3/11
        db.add(DailyLog(id=DAILY_LOG_IDS[3], author_id=STUDENT2_ID, date=date(2026, 3, 11)))
        await db.flush()
        db.add_all([
            DailyBlock(id=DAILY_BLOCK_IDS[7], daily_log_id=DAILY_LOG_IDS[3], block_order=0,
                       content="서사 구조 분석 알고리즘 논문 초안 작성 완료. GCA 프레임워크 Section 3 초안 리뷰.",
                       section=BlockSection.yesterday, project_id=PROJECT2_ID,
                       visibility=BlockVisibility.project),
            DailyBlock(id=DAILY_BLOCK_IDS[8], daily_log_id=DAILY_LOG_IDS[3], block_order=1,
                       content="공동연구자 피드백 반영 및 실험 결과 시각화 작업. 한국서사학회 발표자료 준비.",
                       section=BlockSection.today, project_id=PROJECT2_ID,
                       visibility=BlockVisibility.project),
        ])
        await db.flush()

        # 박학생 3/12
        db.add(DailyLog(id=DAILY_LOG_IDS[4], author_id=STUDENT2_ID, date=date(2026, 3, 12)))
        await db.flush()
        db.add_all([
            DailyBlock(id=DAILY_BLOCK_IDS[9], daily_log_id=DAILY_LOG_IDS[4], block_order=0,
                       content="데이터 전처리 파이프라인 코드 리팩토링. 배치 사이즈 조절 자동화.",
                       section=BlockSection.yesterday, project_id=PROJECT1_ID,
                       visibility=BlockVisibility.project),
            DailyBlock(id=DAILY_BLOCK_IDS[10], daily_log_id=DAILY_LOG_IDS[4], block_order=1,
                       content="NRF 서사 분석 시각화 그래프 생성. seaborn 히트맵으로 패턴 확인.",
                       section=BlockSection.today, project_id=PROJECT2_ID,
                       visibility=BlockVisibility.internal),
        ])
        await db.flush()

        # 박학생 3/13
        db.add(DailyLog(id=DAILY_LOG_IDS[5], author_id=STUDENT2_ID, date=date(2026, 3, 13)))
        await db.flush()
        db.add_all([
            DailyBlock(id=DAILY_BLOCK_IDS[11], daily_log_id=DAILY_LOG_IDS[5], block_order=0,
                       content="시각화 작업 완료. Section 4 결론 초안 작성 시작.",
                       section=BlockSection.yesterday, project_id=PROJECT2_ID,
                       visibility=BlockVisibility.project),
            DailyBlock(id=DAILY_BLOCK_IDS[12], daily_log_id=DAILY_LOG_IDS[5], block_order=1,
                       content="KOCCA 데이터 전처리 v2 테스트. 처리 속도 2배 개선 확인.",
                       section=BlockSection.today, project_id=PROJECT1_ID,
                       visibility=BlockVisibility.project),
        ])
        await db.flush()

        # 최학생 3/11
        db.add(DailyLog(id=DAILY_LOG_IDS[6], author_id=STUDENT3_ID, date=date(2026, 3, 11)))
        await db.flush()
        db.add_all([
            DailyBlock(id=DAILY_BLOCK_IDS[13], daily_log_id=DAILY_LOG_IDS[6], block_order=0,
                       content="코퍼스 데이터 수집 완료 (한국 현대소설 200편). OCR 후처리 진행 중.",
                       section=BlockSection.yesterday, project_id=PROJECT2_ID,
                       visibility=BlockVisibility.project),
            DailyBlock(id=DAILY_BLOCK_IDS[14], daily_log_id=DAILY_LOG_IDS[6], block_order=1,
                       content="학회 발표 슬라이드 초안 작성. 연구 배경 + 방법론 파트.",
                       section=BlockSection.today, project_id=PROJECT2_ID,
                       visibility=BlockVisibility.project),
        ])
        await db.flush()

        # 최학생 3/12
        db.add(DailyLog(id=DAILY_LOG_IDS[7], author_id=STUDENT3_ID, date=date(2026, 3, 12)))
        await db.flush()
        db.add_all([
            DailyBlock(id=DAILY_BLOCK_IDS[15], daily_log_id=DAILY_LOG_IDS[7], block_order=0,
                       content="NRF 연차보고서 1차 년도 성과 정리. 논문 2편, 학회발표 3건.",
                       section=BlockSection.yesterday, project_id=PROJECT2_ID,
                       visibility=BlockVisibility.project),
            DailyBlock(id=DAILY_BLOCK_IDS[16], daily_log_id=DAILY_LOG_IDS[7], block_order=1,
                       content="발표자료 실험 결과 섹션 작성. 정확도 그래프 + 예시 추가.",
                       section=BlockSection.today, project_id=PROJECT2_ID,
                       visibility=BlockVisibility.project),
            DailyBlock(id=DAILY_BLOCK_IDS[17], daily_log_id=DAILY_LOG_IDS[7], block_order=2,
                       content="OCR 후처리에서 고어체 인식률이 낮음. 별도 학습 데이터 필요한지 논의 필요.",
                       section=BlockSection.issue, project_id=PROJECT2_ID,
                       visibility=BlockVisibility.advisor),
        ])
        await db.flush()

        # ── DailyBlock Tags ───────────────────────────────────────────────
        db.add_all([
            DailyBlockTag(daily_block_id=DAILY_BLOCK_IDS[0], tag_id=TAG_IDS[0]),   # AI/ML
            DailyBlockTag(daily_block_id=DAILY_BLOCK_IDS[0], tag_id=TAG_IDS[1]),   # Diffusion
            DailyBlockTag(daily_block_id=DAILY_BLOCK_IDS[1], tag_id=TAG_IDS[4]),   # Animation
            DailyBlockTag(daily_block_id=DAILY_BLOCK_IDS[1], tag_id=TAG_IDS[6]),   # Pipeline
            DailyBlockTag(daily_block_id=DAILY_BLOCK_IDS[2], tag_id=TAG_IDS[3]),   # 인프라
            DailyBlockTag(daily_block_id=DAILY_BLOCK_IDS[7], tag_id=TAG_IDS[5]),   # NLP
            DailyBlockTag(daily_block_id=DAILY_BLOCK_IDS[7], tag_id=TAG_IDS[2]),   # 논문리뷰
            DailyBlockTag(daily_block_id=DAILY_BLOCK_IDS[13], tag_id=TAG_IDS[7]),  # 서사학
        ])
        await db.flush()

        # ── Attendance (3/10 ~ 3/14) ──────────────────────────────────────
        students = [STUDENT1_ID, STUDENT2_ID, STUDENT3_ID]
        checkin_times = {
            STUDENT1_ID: [(9, 5), (9, 12), (8, 55), (9, 30), (9, 8)],
            STUDENT2_ID: [(9, 0), (9, 45), (9, 10), (9, 3), (10, 15)],
            STUDENT3_ID: [(9, 20), (9, 15), (9, 5), (9, 10), (9, 0)],
        }
        for i, d in enumerate(range(10, 15)):
            for sid in students:
                h, m = checkin_times[sid][i]
                ci = kst_dt(2026, 3, d, h, m)
                co = kst_dt(2026, 3, d, h + 9, 0)
                db.add(Attendance(
                    user_id=sid, date=date(2026, 3, d),
                    check_in=ci, check_out=co, type=AttendanceType.daily,
                ))
        await db.flush()

        # ── Events ────────────────────────────────────────────────────────
        events = [
            Event(id=EVENT_IDS[0], title="대학원 세미나", event_type=EventType.class_,
                  start_at=kst_dt(2026, 3, 10, 10, 0), end_at=kst_dt(2026, 3, 10, 12, 0),
                  creator_id=PROF_ID, visibility=BlockVisibility.internal),
            Event(id=EVENT_IDS[1], title="KOCCA 주간회의", event_type=EventType.meeting,
                  start_at=kst_dt(2026, 3, 12, 14, 0), end_at=kst_dt(2026, 3, 12, 15, 30),
                  creator_id=PROF_ID, project_id=PROJECT1_ID, visibility=BlockVisibility.project),
            Event(id=EVENT_IDS[2], title="지도교수 면담", event_type=EventType.meeting,
                  start_at=kst_dt(2026, 3, 11, 15, 0), end_at=kst_dt(2026, 3, 11, 16, 0),
                  creator_id=PROF_ID, visibility=BlockVisibility.advisor),
            Event(id=EVENT_IDS[3], title="NRF 논문 초안 마감", event_type=EventType.deadline,
                  start_at=kst_dt(2026, 3, 7, 0, 0), end_at=kst_dt(2026, 3, 7, 23, 59),
                  creator_id=PROF_ID, project_id=PROJECT2_ID, visibility=BlockVisibility.project,
                  all_day=True),
            Event(id=EVENT_IDS[4], title="CHI 2026 발표 리허설", event_type=EventType.presentation,
                  start_at=kst_dt(2026, 3, 14, 13, 0), end_at=kst_dt(2026, 3, 14, 15, 0),
                  creator_id=PROF_ID, visibility=BlockVisibility.internal),
            Event(id=EVENT_IDS[5], title="KOCCA Phase 2 중간보고", event_type=EventType.deadline,
                  start_at=kst_dt(2026, 3, 15, 0, 0), end_at=kst_dt(2026, 3, 15, 23, 59),
                  creator_id=PROF_ID, project_id=PROJECT1_ID, visibility=BlockVisibility.project,
                  all_day=True),
            Event(id=EVENT_IDS[6], title="한국서사학회 발표", event_type=EventType.presentation,
                  start_at=kst_dt(2026, 3, 20, 10, 0), end_at=kst_dt(2026, 3, 20, 12, 0),
                  creator_id=PROF_ID, project_id=PROJECT2_ID, visibility=BlockVisibility.project),
            Event(id=EVENT_IDS[7], title="NRF 연차보고서 제출", event_type=EventType.deadline,
                  start_at=kst_dt(2026, 3, 20, 0, 0), end_at=kst_dt(2026, 3, 20, 23, 59),
                  creator_id=PROF_ID, project_id=PROJECT2_ID, visibility=BlockVisibility.project,
                  all_day=True),
            Event(id=EVENT_IDS[8], title="대학원 세미나", event_type=EventType.class_,
                  start_at=kst_dt(2026, 3, 17, 10, 0), end_at=kst_dt(2026, 3, 17, 12, 0),
                  creator_id=PROF_ID, visibility=BlockVisibility.internal),
            Event(id=EVENT_IDS[9], title="KOCCA 주간회의", event_type=EventType.meeting,
                  start_at=kst_dt(2026, 3, 19, 14, 0), end_at=kst_dt(2026, 3, 19, 15, 30),
                  creator_id=PROF_ID, project_id=PROJECT1_ID, visibility=BlockVisibility.project),
            Event(id=EVENT_IDS[10], title="프로젝트 전체 회의", event_type=EventType.meeting,
                  start_at=kst_dt(2026, 3, 25, 10, 0), end_at=kst_dt(2026, 3, 25, 12, 0),
                  creator_id=PROF_ID, visibility=BlockVisibility.internal),
        ]
        db.add_all(events)
        await db.flush()

        # ── Event Participants ────────────────────────────────────────────
        db.add_all([
            EventParticipant(event_id=EVENT_IDS[1], user_id=STUDENT1_ID, participant_role="attendee"),
            EventParticipant(event_id=EVENT_IDS[1], user_id=STUDENT2_ID, participant_role="attendee"),
            EventParticipant(event_id=EVENT_IDS[1], user_id=EXTERNAL_ID, participant_role="attendee"),
            EventParticipant(event_id=EVENT_IDS[2], user_id=STUDENT1_ID, participant_role="attendee"),
            EventParticipant(event_id=EVENT_IDS[4], user_id=STUDENT1_ID, participant_role="presenter"),
            EventParticipant(event_id=EVENT_IDS[6], user_id=STUDENT2_ID, participant_role="presenter"),
            EventParticipant(event_id=EVENT_IDS[6], user_id=STUDENT3_ID, participant_role="presenter"),
        ])
        await db.flush()

        # ── Notifications ─────────────────────────────────────────────────
        db.add_all([
            Notification(id=NOTIF_IDS[0], user_id=STUDENT1_ID,
                         notification_type=NotificationType.task_assigned,
                         title="새 태스크가 배정되었습니다",
                         body="'Diffusion 모델 v2 학습' 태스크가 배정되었습니다.",
                         target_type="task", target_id=TASK_IDS[0]),
            Notification(id=NOTIF_IDS[1], user_id=STUDENT1_ID,
                         notification_type=NotificationType.event_reminder,
                         title="KOCCA 주간회의 (오늘 14:00)",
                         body="KOCCA AI 애니메이션 파이프라인 주간회의가 2시간 후 시작됩니다.",
                         target_type="event", target_id=EVENT_IDS[1]),
            Notification(id=NOTIF_IDS[2], user_id=STUDENT2_ID,
                         notification_type=NotificationType.task_assigned,
                         title="새 태스크가 배정되었습니다",
                         body="'서사 구조 분석 알고리즘 논문' 태스크가 배정되었습니다.",
                         target_type="task", target_id=TASK_IDS[5]),
            Notification(id=NOTIF_IDS[3], user_id=PROF_ID,
                         notification_type=NotificationType.daily_issue,
                         title="이학생: GPU OOM 이슈 보고",
                         body="A100 80GB에서 batch size 4 이상 OOM 발생",
                         target_type="daily_block", target_id=DAILY_BLOCK_IDS[2],
                         is_read=False),
            Notification(id=NOTIF_IDS[4], user_id=PROF_ID,
                         notification_type=NotificationType.daily_issue,
                         title="최학생: OCR 인식률 이슈",
                         body="고어체 인식률이 낮아 별도 학습 데이터 필요",
                         target_type="daily_block", target_id=DAILY_BLOCK_IDS[17],
                         is_read=False),
        ])
        await db.flush()

        await db.commit()
        print("=" * 60)
        print("Seed complete!")
        print(f"  Users: 5")
        print(f"  Projects: 2")
        print(f"  Tasks: 10")
        print(f"  DailyLogs: 8 (3 students × 3days, -1)")
        print(f"  DailyBlocks: 18")
        print(f"  Tags: 8")
        print(f"  Attendance: 15 (3 students × 5 days)")
        print(f"  Events: 11")
        print(f"  Notifications: 5")
        print("=" * 60)
        print("Login emails:")
        print("  professor@test.com  (교수)")
        print("  student1@test.com   (이학생)")
        print("  student2@test.com   (박학생)")
        print("  student3@test.com   (최학생)")
        print("  external@company.com (외부파트너)")


async def seed_all():
    """Hub + VFX 통합 시드 + Phase 1 (모터헤드AIxVFX umbrella + 분야 Project)."""
    await reset_and_seed()
    # === VFX 카테고리 시드 ===
    try:
        from seed_vfx import seed_categories  # backend/seed_vfx.py
        print()
        print("=" * 60)
        print("VFX 카테고리 시드 시작...")
        print("=" * 60)
        await seed_categories()
    except ImportError as e:
        print(f"⚠️  VFX seed skip (seed_vfx.py 없음): {e}")
    except Exception as e:
        print(f"⚠️  VFX seed 실패 (계속 진행): {e}")

    # === Phase 1: 모터헤드AIxVFX umbrella + 분야 Project ===
    try:
        from seed_phase1 import seed_phase1  # backend/seed_phase1.py
        print()
        print("=" * 60)
        print("Phase 1: 모터헤드AIxVFX 트리 시드 시작...")
        print("=" * 60)
        await seed_phase1()
    except ImportError as e:
        print(f"⚠️  Phase 1 seed skip: {e}")
    except Exception as e:
        print(f"⚠️  Phase 1 seed 실패 (계속 진행): {e}")


if __name__ == "__main__":
    asyncio.run(seed_all())
