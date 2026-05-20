# G30SotaHub v2 — Architecture Guide

> **이 문서는 AI 에이전트가 프로젝트에 처음 붙을 때 읽는 진입점입니다.**
> 코드를 읽기 전에 이 문서를 먼저 읽으면 구조를 즉시 파악할 수 있습니다.

---

## 🚨 통합 컨텍스트 (2026-04-30~) — 반드시 먼저 읽기

본 폴더 `G30SotaHub_v2` 는 두 별개 프로젝트를 통합하여 진화한 **R&D Knowledge Graph Platform**:

- **glocal30Hub** (Hub 베이스, 이 문서의 §"프로젝트 개요" 이하가 그 설명)
- **vfx-sota-monitor** (SOTA 자동 수집·점수화·계보 + Arca 에이전트 — Phase 1-2 에서 흡수)

### 핵심 결정사항 (모두 합의 완료)

1. **단일 5090 PC** 배포 — Web/Postgres/Ollama/크롤러 한 곳, Tailscale 분산 종료
2. **Karpathy LLM Wiki 온톨로지** — raw / wiki / outputs 3-tier, Ingest / Query / Lint 3 ops
3. **노드그래프 시각화** (reactflow) — 트리 X, 그래프 O. 분야 자유 추가/이동/병합
4. **노드 카드** 에 GitHub / HuggingFace / arXiv / Papers With Code / X 통합 표시 + 계보 + 담당자
5. **모터헤드** 등 외부 협업사를 `external` 역할로 가입 → 같은 프로젝트 내 모델 공유 (가시성 옵션 B)
6. **NAS** 영상 저장 — 네트워크 드라이브 마운트, 백엔드 프록시 스트리밍
7. **Arca 주간 리포트** — 자동 초안 → 본인 + 관리자 검토 → 발행 워크플로
8. **마이그레이션**: vfx-sota-monitor SQLite 데이터(572KB, 68 items) 폐기 + 재크롤로 깨끗하게 시작

### 현재 진행 상태 (Phase 0-6 로드맵)

| Phase | 내용 | 상태 |
|-------|------|------|
| **0** | 부트스트랩 (이 폴더 생성, 정체성 확립) | ✅ 완료 (2026-05-01) |
| **1** | DB 스키마 마이그레이션 (3-4일) | ⏭ 다음 |
| **2** | VFX 백엔드 흡수 (4-5일) | — |
| **3** | 그래프 UI (5-6일) | — |
| **4** | 모터헤드 협업 UX (3-4일) | — |
| **5** | Arca 주간 리포트 (4-6일) | — |
| **6** | 정리 + vfx-sota-monitor 폐기 (2-3일) | — |

### 필독 문서

- **마스터 설계서** (14장): [`docs/superpowers/plans/2026-04-30-vfx-integration-knowledge-graph.md`](docs/superpowers/plans/2026-04-30-vfx-integration-knowledge-graph.md) — 비전·아키텍처·온톨로지·스키마·권한·Arca 리포트·Phase 분할
- **Phase 1 즉시 액션**: [`PLAN.md`](PLAN.md)
- **선행 분석 기록**: `Z:\Antigravity_prj\Vault\00_Master\_log.md` (2026-04-30 통합 결정)

### 두 원본 폴더 (참조용, 변경 금지)

- `Z:\Antigravity_prj\glocal30Hub\` — Hub 원본 (이 폴더의 베이스)
- `Z:\Antigravity_prj\vfx-sota-monitor\` — VFX 원본 (Phase 1-2 에서 점진적 흡수)

> **이 폴더(G30SotaHub_v2)가 진본**. 두 원본은 역사적 참조용으로만 보존.

### Karpathy LLM Wiki 온톨로지 (글로벌 Vault Protocol 의 코드화)

사용자의 글로벌 Vault Protocol (`C:\Users\USER\.claude\CLAUDE.md`) 을 R&D 도메인에 적용:

| Tier | DB 매핑 | 의미 |
|------|---------|------|
| **raw** | `model_raw_snapshots` (불변) | 처음 발견된 원문 (arxiv abstract, github README, ...). 수정 금지 |
| **wiki** | `sota_items` (수정됨, version 증가) | 우리가 정리한 지식. wiki_body 본문에 [[wikilink]] 포함 |
| **outputs** | `reports` 테이블 | 주간 리포트, 분석, 비교 |

3 Operations:
- **Ingest** (자동, 크롤러·야간 배치) — 새 모델 발견 → raw 저장 → wiki 초안 → 엣지 추정 → \_log
- **Query** (사용자 검색·조회) — memory → wiki → raw, 의미있으면 outputs 저장 + wiki 갱신 (Compounding Loop)
- **Lint** (주간 헬스체크) — stale (90일+), 모순(contradicted), 깨진 wikilink, 고아 노드

Confidence 태그: `🟢 verified | 🟡 stale | 🔴 contradicted | ⚪ unverified`

### AI 에이전트 작업 시 주의사항

- **Phase 1-6 진행 중**에는 통합 작업이 활발히 일어남. 새 작업 시작 전 [PLAN.md](PLAN.md) 와 마스터 설계서 §10 Phase 분할 확인.
- 기존 Hub 코드(아래 §"프로젝트 개요" 이하 설명) 가 아직 그대로 살아있음. Phase 2 까지는 회귀 방지가 우선.
- VFX 의 sources / tasks(arca) / models 는 **Phase 1-2 에서 흡수**됨. 그 전까지는 `Z:\Antigravity_prj\vfx-sota-monitor\` 에서 참조만.

---

## 프로젝트 개요

연구실 협업 허브. 교수-학생 간 일일 활동 추적, 프로젝트/태스크 관리, 출결, SOTA 논문 리뷰, 보고서 생성을 통합 제공.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | FastAPI + SQLAlchemy 2.x (async) + PostgreSQL 16 |
| **Frontend** | React 18 + TypeScript + Vite + Tailwind CSS |
| **Auth** | Google OAuth (Authlib) + JWT (python-jose) |
| **DB Migration** | Alembic |
| **E2E Test** | Playwright (`frontend/tests/e2e/`) |
| **Future LLM** | Ollama + gemma4 (Reports/SOTA 분석용, 미구현) |

## 디렉토리 구조

```
glocal30Hub/
  backend/
    app/
      api/v1/          ← 16개 API 모듈 (아래 모듈 맵 참조)
      models/           ← 14개 SQLAlchemy 모델
      schemas/          ← Pydantic 스키마
      services/         ← google_calendar, notifications
      core/             ← encryption (Fernet)
      dependencies.py   ← 인증/권한 헬퍼 5개
      config.py         ← 환경 변수 (pydantic-settings)
      database.py       ← async engine + session
      main.py           ← FastAPI app + middleware
    alembic/versions/   ← DB 마이그레이션
    seed.py             ← 테스트용 시드 데이터 (admin, prof, student×3, external)
  frontend/
    src/
      pages/            ← 17개 페이지 컴포넌트
      components/       ← Layout, MiniCalendar, FeedFilterBar
      api/client.ts     ← 모든 백엔드 API 호출 (단일 파일)
      contexts/         ← AuthContext, RoleContext
    tests/e2e/          ← Playwright 시나리오
  docker-compose.yml    ← PostgreSQL + backend + frontend
  .env                  ← Google OAuth keys, SECRET_KEY, DB URL (git-ignored)
```

---

## DB 스키마 관계도

```
User (admin | professor | student | external)
 │
 ├── AdvisorRelation ──→ User (professor ↔ student)
 │
 ├── DailyLog (1일 1개, author+date unique)
 │     └── DailyBlock (section: yesterday/today/issue/misc)
 │           ├── visibility: private | advisor | internal | project
 │           ├── search_vector (TSVECTOR + GIN, 자동 트리거)
 │           ├── DailyBlockTag ──→ Tag
 │           ├── project_id ──→ Project (nullable)
 │           ├── task_id ──→ Task (nullable)
 │           └── Comment (self-ref parent_id for replies)
 │
 ├── ProjectMember ──→ Project (role: viewer/member/manager/lead)
 │                       └── Task (self-ref parent_id, max 3depth)
 │                             ├── TaskAssignee ──→ User
 │                             └── TaskGroup (kanban 그룹)
 │
 ├── Event ──→ EventParticipant (Google Calendar 양방향 동기화)
 ├── Attendance (check_in/check_out per day)
 ├── Notification (in-app, polymorphic target)
 │
 ├── SotaItem ──→ SotaAssignment ──→ SotaReview
 ├── ReportSnapshot (weekly/project/student/advisor 집계)
 ├── Attachment (polymorphic: owner_type + owner_id)
 └── AuditLog (admin 행위 기록)
```

**총 21개 테이블.** 모든 PK는 UUID. TimestampMixin(created_at, updated_at) 공통 적용.

---

## 권한 매트릭스

### 역할별 접근 정책

| 리소스 | admin | professor | student | external |
|--------|-------|-----------|---------|----------|
| **프로젝트 목록** | 전체 | 전체 | 멤버인 것만 | 멤버인 것만 |
| **프로젝트 상세/멤버/태스크** | 전체 | 전체 | 멤버만 (403) | 멤버만 (403) |
| **프로젝트 수정** | OK | OK (lead/manager) | lead/manager만 | 불가 |
| **멤버 추가/제거** | OK | OK | lead/manager만 | 불가 |
| **태스크 CRUD** | OK | OK | 멤버만 | 멤버만 (읽기) |
| **데일리 로그 생성** | 불가 | 불가 | 학생만 | 불가 |
| **데일리 로그 조회** | 전체 | 지도학생 위주 | 전체 (투명 정책) | 전체 (visibility 필터) |
| **주간 노트 작성** | OK | OK | OK | OK |
| **주간 요약/carryover** | OK | OK | 불가 (403) | 불가 (403) |
| **출결 조회 (전체)** | OK | OK | 본인만 | 본인만 |
| **Admin 패널** | OK | OK | 불가 (403) | 불가 (403) |
| **SOTA 생성/배정** | OK | OK | 불가 | 불가 |
| **보고서 삭제** | OK | OK | 불가 | 불가 |
| **Google Calendar** | 본인 | 본인 | 본인 | 본인 |

### 데일리 블록 가시성 (Visibility)

| visibility | 본인 | 지도교수 (advisor) | 내부 (학생/교수) | 프로젝트 멤버 |
|------------|------|-------------------|-----------------|--------------|
| `private` | O | X | X | X |
| `advisor` | O | O | X | X |
| `internal` | O | O | O | X |
| `project` | O | O | O | O (같은 프로젝트) |

---

## 모듈별 해설

### Backend API (`backend/app/api/v1/`)

| 모듈 | 엔드포인트 수 | 핵심 역할 |
|------|-------------|----------|
| **auth.py** | 7 | Google OAuth 로그인/콜백, Calendar 연결, JWT 발급, dev-login |
| **users.py** | 5 | 사용자 CRUD + 지도교수 관계 조회/생성 |
| **projects.py** | 7 | 프로젝트 CRUD + 멤버 관리. `require_project_membership`으로 접근 제어 |
| **tasks.py** | 18 | 태스크 CRUD + 트리구조 + 그룹(칸반) + 배정/해제 + carryover |
| **daily.py** | 10 | 데일리 로그/블록 CRUD + 키워드 검색(TSVECTOR) + 가시성 필터링 |
| **comments.py** | 4 | 블록 댓글 CRUD + 대댓글(parent_id) + 알림 트리거 |
| **tags.py** | 4 | 태그 CRUD (global/project scope) |
| **events.py** | 5 | 이벤트 CRUD + Google Calendar 양방향 동기화 |
| **gcal.py** | 4 | Google Calendar 상태/연결해제/push/pull |
| **weekly_notes.py** | 4 | 주간 노트 저장 + 요약 집계 + 미완료 태스크 이월 |
| **attendance.py** | 6 | 출결 체크인/아웃 + 히스토리 + 통계 |
| **notifications.py** | 5 | 알림 목록/읽음/전체읽음/삭제 |
| **admin.py** | 10 | 사용자 역할/상태 변경 + 지도교수 배정 + 프로젝트/태그 관리 + 감사 로그 |
| **reports.py** | 5 | 보고서 CRUD + 자동 생성 (데일리/태스크/출결 집계, LLM 요약 TODO) |
| **sota.py** | 10 | 논문 아이템 CRUD + 배정 + 리뷰 + 분석(미구현, 501) |
| **uploads.py** | 2 | 파일 업로드(10MB 제한) + 정적 파일 서빙 |

### Backend 핵심 서비스

| 파일 | 역할 |
|------|------|
| **dependencies.py** | `get_current_user` (JWT 검증), `require_role`, `require_project_membership`, `require_project_role`, `require_advisor_of` |
| **services/google_calendar.py** | Google Calendar API 래핑. `asyncio.to_thread`로 동기 호출 래핑. 암호화된 refresh token 사용 |
| **services/notifications.py** | 알림 생성 헬퍼 (댓글/태스크 배정 시 트리거) |
| **core/encryption.py** | Fernet 기반 대칭 암호화 (Google refresh token 저장용) |

### Frontend 페이지 (`frontend/src/pages/`)

| 페이지 | 경로 | 설명 |
|--------|------|------|
| Dashboard | `/` | 역할별 대시보드 |
| Login | `/login` | Google OAuth 진입 |
| AuthCallback | `/auth/callback` | OAuth 콜백 토큰 수신 |
| DailyWrite | `/daily/write` | 학생 데일리 작성 (section별 textarea + 태스크 연결 + 태그) |
| DailyFeed | `/daily/feed` | 통합 피드 (멤버/프로젝트/전체 필터 + 키워드 검색 + URL 동기화) |
| Projects | `/projects` | 프로젝트 목록 (멤버십 필터) |
| ProjectDetail | `/projects/:id` | 프로젝트 상세 + 칸반 보드 |
| Weekly | `/weekly` | 주간 노트 + 학생별 요약 + 태스크 배정 드래그앤드롭 |
| Calendar | `/calendar` | 캘린더 뷰 + Google Calendar 동기화 |
| Members | `/members` | 멤버 목록 |
| MemberDetail | `/members/:id` | 멤버 프로필 + 활동 |
| Profile | `/profile` | 내 프로필 + Google Calendar 연결 |
| Attendance | `/attendance` | 출결 체크인/아웃 + 히스토리 |
| Admin | `/admin` | 관리자 패널 (역할/상태/지도교수/프로젝트/태그) |
| Notifications | `/notifications` | 알림 센터 |
| Reports | `/reports` | 보고서 목록 + 생성 |
| Sota | `/sota` | SOTA 논문 관리 + 배정 + 리뷰 |

---

## 핵심 설계 결정

1. **데일리 블록 가시성**: 블록 단위로 공개 범위 설정. `_filter_blocks_by_visibility` 헬퍼가 뷰어 기준으로 런타임 필터링
2. **프로젝트 멤버십 기반 접근**: student/external은 본인이 멤버인 프로젝트만 접근 가능. admin/professor는 전체 조회 (연구실 감독 목적)
3. **Google Calendar 분리 인증**: 로그인은 `openid email profile`만 요청. Calendar 권한은 `/connect-gcal`로 별도 opt-in
4. **Refresh token 암호화**: Fernet 대칭 암호화 후 DB 저장. `core/encryption.py`
5. **TSVECTOR 검색**: `daily_blocks.search_vector`에 GIN 인덱스 + `BEFORE INSERT/UPDATE` 트리거로 자동 갱신. `simple` config (한국어 기본 토큰화)
6. **태스크 트리**: self-ref `parent_id` + 최대 3depth 제한 + 순환참조 검증
7. **감사 로그**: Admin의 역할/상태/지도교수 변경은 `AuditLog`에 기록
8. **Weekly Notes = ReportSnapshot**: 주간 노트는 `report_type='weekly'`인 ReportSnapshot으로 저장 (보고서 인프라 재활용)

---

## 개발 환경

```bash
# 백엔드
cd backend
python -m venv .venv && .venv\Scripts\activate  # Windows
pip install -r requirements.txt
alembic upgrade head
python seed.py  # 테스트 데이터 주입
uvicorn app.main:app --host 0.0.0.0 --port 8011 --reload

# 프론트엔드
cd frontend
npm install
npm run dev -- --host 0.0.0.0

# E2E 테스트 (서버 실행 상태에서)
cd frontend
npm run test:e2e        # headless
npm run test:e2e:ui     # interactive UI

# Docker (올인원)
docker compose up --build
```

## 환경 변수 (.env)

```
DATABASE_URL=postgresql+asyncpg://hub:hub@localhost:5432/hub
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:8011/api/v1/auth/callback
SECRET_KEY=change-me-in-production
ENCRYPTION_KEY=        # Fernet key (비워두면 SECRET_KEY에서 파생)
DEBUG=true             # dev-login 활성화
FRONTEND_URL=http://localhost:3030
GOOGLE_CALENDAR_ENABLED=true
```

## 시드 데이터 (seed.py)

| Email | Role | 멤버십 |
|-------|------|--------|
| admin@test.com | admin | (없음, bypass) |
| professor@test.com | professor | KOCCA lead, NRF lead |
| student1@test.com | student | KOCCA member |
| student2@test.com | student | KOCCA member, NRF member |
| student3@test.com | student | NRF member |
| external@company.com | external | KOCCA viewer |

---

## Windows 서버 주의사항

**E2E 테스트 반복 실행 시 포트 고갈 주의.** Windows 기본 동적 포트 범위가 16,384개뿐이라, Playwright을 여러 번 돌리면 TIME_WAIT 상태의 TCP 연결이 포트를 전부 점유하여 서버가 응답 불가 상태가 됨.

**사전 적용 필요 (관리자 권한, 1회):**
```powershell
netsh int ipv4 set dynamicport tcp start=1025 num=64511
reg add "HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters" /v TcpTimedWaitDelay /t REG_DWORD /d 30 /f
```
적용 후 재부팅. 이후에는 E2E 테스트 반복 실행해도 포트 부족 안 생김.

**증상:** Vite proxy 타임아웃, 로딩이 극도로 느려짐, `netstat -an | find "TIME_WAIT"` 결과가 수천 개.
**임시 해결:** 재부팅 (TIME_WAIT 전부 해제).

---

## 알려진 이슈 / TODO

- **#6** — 하이브리드 검색 (pgvector + BM25, 장기)
- **#10** — Playwright E2E 확대 (진행중)
- **#11** — `/tasks/carryover` 권한 누락 (minor bug)
- **Reports LLM** — `reports.py:226` TODO. Ollama + gemma4 예정
- **SOTA 분석** — `sota.py:389` 501 Not Implemented. 동일
