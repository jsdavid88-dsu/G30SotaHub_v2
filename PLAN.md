# PLAN — Phase 1 진입 직전 액션 체크리스트

> **본 문서는 즉시 실행 가능한 Phase 1 작업 목록.**
> 큰 그림과 설계 근거는 [docs/superpowers/plans/2026-04-30-vfx-integration-knowledge-graph.md](docs/superpowers/plans/2026-04-30-vfx-integration-knowledge-graph.md) 참조.

---

## 현재 상태 (2026-05-01)

- ✅ Phase 0 부트스트랩 완료 (이 폴더 생성, 정체성 확립, 첫 통합 커밋)
- ⏭ Phase 1 DB·인프라 마이그레이션 진입 직전

---

## Phase 1: DB·인프라 마이그레이션 (3-4일)

### 1.1 환경 준비

- [ ] `.env` 작성 — 기존 Hub `.env` 기반 + Ollama URL, NAS 경로, VFX 크롤러용 토큰
- [ ] Postgres 16 로컬 인스턴스 가동 확인 (또는 docker-compose)
- [ ] Python venv 새로 생성 + `requirements.txt` 갱신 (vfx 의존성 추가: `crawl4ai`, `praw`, `apscheduler`, `huggingface-hub`, `beautifulsoup4`, `lxml`, `pytz`)
- [ ] Frontend 의존성 갱신 — `reactflow`, `@tanstack/react-query`, `recharts`, `lucide-react` 추가
- [ ] `feat/vfx-integration-phase-1` 브랜치 생성

### 1.2 데이터 모델 변경 (마스터 설계서 §5 그대로)

**`backend/app/models/project.py` — self-ref 추가**
- [ ] `parent_id: UUID | None` (자기참조)
- [ ] `project_type: str` ("umbrella" | "discipline" | "initiative")
- [ ] `description: str | None`

**`backend/app/models/sota.py` — `SotaItem` 대대적 확장 (VFX `Item` 흡수)**
- [ ] Karpathy 온톨로지 필드: `description` (50자), `wiki_body` (markdown), `status`, `version`
- [ ] 외부 참조: `refs: JSONB` ({github, huggingface, arxiv, papers_with_code, x, project_page, demo})
- [ ] 라이프사이클: `lifecycle_status`, `replaced_by_id` (self-ref), `deprecated_at`, `deprecated_reason`
- [ ] 분야 연결: `project_id`
- [ ] 점수·메타: `keyword_score`, `llm_score`, `llm_reason`, `priority`, `item_metadata` (JSONB), `free_tags` (JSONB), `group_id`
- [ ] `slug` 자동 생성 hook

**`backend/app/models/graph.py` — 신규 (별도 파일)**
- [ ] `GraphNode` (UUID, node_type, ref_id, label, meta JSONB)
- [ ] `GraphEdge` (UUID, source_node_id, target_node_id, edge_type, weight, status, created_by, meta JSONB)

**`backend/app/models/raw_snapshot.py` — 신규 (불변)**
- [ ] `ModelRawSnapshot` (UUID, sota_item_id, source, captured_at, raw_content, raw_url) — append-only

**`backend/app/models/report.py` — 확장**
- [ ] `report_type` 에 "sota_weekly" 추가
- [ ] `status: str` (draft | review | published)
- [ ] `arca_seed_data: JSONB` (원본 분석 데이터 보존)
- [ ] `target_period_start/end`, `target_project_id`, `body_markdown`
- [ ] `reviewed_by`, `published_at`

### 1.3 Alembic 마이그레이션

- [ ] `alembic revision --autogenerate -m "phase-1: vfx integration schema"`
- [ ] 자동 생성된 SQL 검토 (제약조건, 인덱스 누락 확인)
- [ ] 인덱스 추가:
  - `sota_items` — `(lifecycle_status, project_id)`, `(group_id)`, `(refs->>github)` (GIN)
  - `graph_edges` — `(source_node_id, edge_type)`, `(target_node_id, edge_type)`
  - `model_raw_snapshots` — `(sota_item_id, captured_at DESC)`
- [ ] `alembic upgrade head` 적용 후 schema 검증
- [ ] 다운그레이드 동작 확인 (`alembic downgrade -1` → `upgrade head`)

### 1.4 시드 데이터 (`backend/seed.py` 확장)

- [ ] `motorhead-vfx` umbrella project 1개 생성
- [ ] 10개 discipline project (vfx-sota-monitor 의 카테고리 그대로):
  - video_matting, video_removal, face_parsing, point_tracking, head_swap, 3dgs, beauty, korean_text_edit, ref_search, qc_program
- [ ] 각 discipline 의 description (한/영)
- [ ] graph_nodes 에 위 11개 등록 (umbrella 1 + discipline 10)
- [ ] graph_edges 에 `contains` 엣지 10개 (umbrella → discipline)

### 1.5 NAS 마운트

- [ ] 5090 PC 에서 NAS 네트워크 드라이브 영구 매핑 (Windows 자격증명 관리자)
- [ ] `M:\sota_files\models\`, `M:\sota_files\reports\`, `M:\sota_files\raw_snapshots\` 폴더 생성
- [ ] 백엔드 서비스 계정에서 read/write 권한 검증
- [ ] Phase 2 의 영상 프록시 라우터를 위한 base path 환경변수 (`NAS_BASE_PATH`) 정의

### 1.6 검증

- [ ] `python -c "from app.models import *"` 임포트 에러 없음
- [ ] `alembic current` → 새 revision id
- [ ] Postgres 에서 `\d sota_items`, `\d graph_nodes`, `\d graph_edges`, `\d model_raw_snapshots` 으로 컬럼 확인
- [ ] `python seed.py` 후 `SELECT name, project_type FROM projects;` → 11개 행 확인
- [ ] 기존 Hub API (auth, users, daily, weekly) 동작 검증 — 회귀 없음

### 1.7 커밋 & 다음 단계

- [ ] `git commit` — "feat(phase-1): vfx integration schema + motorhead-vfx seed"
- [ ] Phase 2 진입용 plan 문서 작성 (`docs/superpowers/plans/2026-05-XX-phase-2-vfx-backend.md`)

---

## Phase 2-6 요약 (Phase 1 끝나면 각각 별도 plan 작성)

- **Phase 2**: VFX 백엔드 흡수 — `/api/v1/sota/*`, `/api/v1/graph/*`, `/api/v1/uploads/video`, APScheduler 통합, Arca 코드 이식
- **Phase 3**: 그래프 UI — KnowledgeGraph 페이지, ModelDetail, 영상 업로드/재생, 댓글 스레드
- **Phase 4**: 모터헤드 협업 UX — `external` 가입 화이트리스트, 가시성 정책 적용, 모델 배정 워크플로
- **Phase 5**: Arca 주간 리포트 — 일요일 22:00 스케줄러, draft → review → published, 푸시 알림
- **Phase 6**: 정리 — vfx-sota-monitor 폐기, Cloudflare Tunnel 일원화, 백업 자동화

---

## 진행 기록

| 날짜 | 작업 | 비고 |
|------|------|------|
| 2026-04-30 | 마스터 설계서 작성 + 두 사이드 정체성 메모 | 통합 결정 합의 |
| 2026-05-01 | Phase 0 부트스트랩 | G30SotaHub_v2 폴더 생성, 첫 커밋 |
