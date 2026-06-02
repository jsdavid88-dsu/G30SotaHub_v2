# PLAN — G30SotaHub v2 (2026-05-21 정리)

> 큰 그림: [docs/superpowers/plans/2026-04-30-vfx-integration-knowledge-graph.md](docs/superpowers/plans/2026-04-30-vfx-integration-knowledge-graph.md)
> 5090 운영: [SETUP_5090.md](SETUP_5090.md)
> 통합 정체성: 연구실 협업 + 자동 SOTA 추적 = 한 R&D Knowledge Graph

---

## 🎯 전체 그림 한 줄

자동 수집 (Arca) → 분류/배정 (Triage) → 학생 검토 (DailyWrite inline 메모) → 팀 토론 (메시지 보드 + 첨부) → 라이프사이클 전환 → Arca 주간 리포트

---

## 🧭 컴팩션 재진입 — 현재 상태 (2026-06-02, 커밋 `59f9208`)

> 이 블록만 봐도 현재 위치·다음 파악 가능. 상세는 아래 섹션들.

**한 줄**: 연구실 협업(Hub) + 자동 SOTA 추적(VFX/Arca) 통합 R&D Knowledge Graph. Phase 0~2 완료, 온톨로지 wiki tier 가동, Phase 3(그래프 UI) 직전.

### GitHub 이슈 상태
- ✅ **CLOSED**: #6(Gemma 파싱→thinking off, 5090 검증 scored130/unscored0) · #14 · #15 · #16 · #17 · #18 · #19 · #20
- 🟡 **OPEN #7** (크롤러): 코드 다 고침(github 공식API→연산자≤5, arxiv 429 스킵, HTTP 재시도래퍼, feed yaml). **5090 `diagnose.ps1 --crawl` 재검증만 남음** → github/arxiv `new>0` 이면 close
- 🟡 **OPEN #9**(배포 alembic 안내) · **#11**(Arca→Hermes/LDR, 3개월 보류) · **#21**(운영 제약 가이드 — env.py만 코드, 나머지 인지)

### 5090 운영 액션 (git pull 후 — 필수)
1. `git pull` (59f9208)
2. `cd backend; .\.venv\Scripts\activate; alembic upgrade head` — **미적용 마이그레이션 j0a1(annotations)·k0a1(fps/web_relpath)·l0a1(arca_settings)**. env.py Windows 정책 적용돼 이제 직접 됨
3. `python seed_vfx.py` — arxiv cs.* 카테고리 (#7)
4. `.env`: `REDDIT_CLIENT_ID/SECRET`(reddit) + `GITHUB_TOKEN`(rate)
5. `copy backend\feed_queries.example.yaml backend\feed_queries.yaml` — feed 쓸 때 (hf/pwc 즉시 동작)
6. `npm --prefix frontend ci` (lockfile #16)
7. `.\diagnose.ps1 --crawl` (또는 `--full`) → 결과 공유

### 이번 세션(2026-06-02) 한 것
- 코드리뷰 #14~20 전부 처리/close
- Arca 강화: brand/family/base_model 자동추출(`262eb27`) + 카테고리 DB 동적주입
- Family grouper(`df8125c`) same_family edge
- 이미지 annotation(`39dfc95`) + 영상 annotation·타임코드(`d055104`) + 트랜스코딩·프레임정밀(`1b3cfa8`)
- 보안: attachment/annotation owner 권한 deny-by-default(`a5b7a2d`/`16d8bba`/`d70f8d8`)
- 진단도구 `diagnose.py`(`e7c46b3`) + Windows fix(`9891625`) + `--full`(`696d6a2`)
- **온톨로지 엔진**: Arca 자동 wiki(`e275bd3`) + wiki `[[link]]`→그래프엣지 wiki_linker(`dd5a3f6`)
- #6 thinking off 근본해결(`3e880cf`/`67642e1`) — 5090 검증 완료(close)
- **관리 UI**: 카테고리 검색키워드 편집(`796f55e`) + Arca 커스텀지침(`751b211`)
- #7 크롤 fix: github 공식API·연산자≤5 / arxiv 429 / HTTP 재시도(`4cc6b8e`/`0bcf753`/`59f9208`)

### 다음 할 일 (검증과 독립 진행 가능)
- 🟢 **온톨로지 마저**: raw tier(ModelRawSnapshot 불변원본) + Lint(stale/모순/고아) — 3-tier·3-ops 완성
- 🟢 **GraphNode/GraphEdge → Phase 3 그래프 UI** (reactflow 본격)
- 🟢 Phase 4 모터헤드 / Phase 5 Arca 주간리포트 / Phase 6 정리

### 운영 제약 (#21 — dev 항상 전제)
- **Windows**(Docker 아님). async CLI 는 win32 `SelectorEventLoopPolicy` 필요 (env.py/run_server/diagnose 적용됨)
- **migration 포함 커밋**은 메시지에 명시 + 5090 `alembic upgrade head` 필요 (미적용 시 500, #9 함정)
- **arxiv 429 / github rate**(GITHUB_TOKEN), DNS 블립은 재시도 / 4xx 는 구분 처리
- **GPU**: `nvidia-smi -pl 400` 캡. night_batch 동시성·배치폭 키우면 사전 이슈+전력 재검증 (현재 SCORE_BATCH=3, wiki 1회 5개 보수적)

### 관리 UI (이번 세션 신규 — 운영자가 코드 재배포 없이)
- 카테고리 상세(`/vfx/category/:slug`): admin/professor → 검색 키워드 5그룹 편집 → 다음 크롤 sweep
- VFX 대시보드: admin/professor → "Arca 지침"(자연어) → score/wiki 프롬프트에 append (골격 JSON 스키마는 코드 고정)

### 온톨로지 3-tier / 3-ops 현황
- wiki 🟢 가동 (Arca 자동생성 + [[link]] 그래프화) / raw ❌(미구현) / outputs 🟡(reports 테이블 O, Arca 주간리포트=Phase5)
- Ingest 🟢(wiki 자동) / Query ✅(검색) / **Lint ❌**(미구현)

---

## ✅ 완료 (큰 단위)

### Phase 0 — 부트스트랩
- ✅ 폴더 구조, 정체성, 첫 커밋

### Phase 1 — DB·인프라 통합
- ✅ Hub SotaItem ↔ VFX Item 단일 모델 (`g0a1b2c3d4e5_unify_sota_and_vfx_items`)
- ✅ 칼럼 추가: description, wiki_body, refs(JSONB), confidence_status, version, lifecycle_status, replaced_by_id, deprecated_at, project_id
- ✅ Project 3단 트리 (`f9a8b7c6d5e4_add_project_tree`): umbrella → discipline → initiative
- ✅ SQLite 잔재 정리 — PostgreSQL 호환 (`json_each` → `jsonb_array_elements_text`, `sqlite_insert` → `pg_insert`) — 6 파일
- ⏸ GraphNode + GraphEdge 모델 — **미구현** (Phase 3 기반으로 필요)
- ⏸ ModelRawSnapshot (불변 원본) — **미구현**

### Phase 1.5 — VFX UI 강화
- ✅ ItemTable + 카드↔표 토글 (`ViewToggle` + `useViewMode` localStorage)
- ✅ Triage 페이지 + `TriageActions` (배정/모터헤드/보류/스킵/완료/후속개발/아카이빙)
- ✅ ItemDetail "현황 & 액션" — lifecycle 배지, refs 외부 링크, assignments+리뷰 시간순, 라이프사이클 시각화
- ✅ RunStatusBar — 백엔드 background 작업 진행 sticky 표시 (admin/professor 만)
- ✅ DailyWrite SOTA 통합 — 학생 inline 메모 → SotaReview + today 자동 기록
- ✅ Hub Dashboard ActiveResearchSection — "진행 중인 연구" 카드 grid (scope all/mine)

### Phase 2 — 협업 메시징
- ✅ Phase 1A — @mention 파싱 + Notification (services/mentions.py)
- ✅ Phase 1B — 프로젝트 활동 피드 (ProjectActivityFeed) — 시간순 통합
- ✅ Phase 2 — 프로젝트 메시지 보드 (ProjectMessage threaded + edit/delete + @mention)

### Phase 2.5 A — 미디어 첨부 + 뷰어 (방금 완료)
- ✅ `Attachment` 모델 확장: `storage_relpath`, `media_type`, `mime`, `width`, `height`, `duration_sec`, `thumbnail_relpath`
- ✅ Storage 추상화 (`services/storage.py`): env `STORAGE_BASE_PATH` + 상대 경로 패턴 → NAS 이전 시 robocopy + env 변경만
- ✅ `/api/v1/attachments/*` — upload + Range stream (영상) + thumbnail (ffmpeg)
- ✅ Frontend `AttachmentUploader` + `MediaViewer` (Lightbox)
- ✅ ProjectMessageBoard 통합 — file picker + 게시 후 일괄 upload + chip + viewer

### 환경 / 검증
- ✅ 포트 8011/3030 + Tailscale funnel 노출
- ✅ start.ps1 PS 5.1 호환 + alembic 검증 prompt + Postgres 응답 체크
- ✅ Login 정리 (G30 SOTA Hub 정체성, 마케팅 카피 제거)
- ✅ Playwright 검증 매트릭스 — 3 역할 × 23 페이지 + 6 fix (RunStatusBar role gate, nested anchor, /reports gate, /announcements, dev-login admin)
- ✅ `SETUP_5090.md` — 5090 클로드 진입점

### Backend 안정화 (이슈 fix push 됨 — 5090 검증 대기)
- ✅ #6 Gemma 파싱: max_tokens 500/item → 1800/item + usage 로그 + raw 디버그 + SCORE_BATCH 5→3 + truncation recovery
- ✅ #7 크롤러 진단 로그 (arxiv/github/reddit 각 단계)
- ✅ #10 SQLite jsonb cast (closed)
- ✅ #12 PS 5.1 `??` (closed)

### 검색 + 카테고리 확장 (방금)
- ✅ `/api/v1/vfx/search` 확장 — description / wiki_body / free_tags + **카테고리 매칭** (한국어 검색)
- ✅ **카테고리 9개 신규** (10 → 19): video_generation, image_generation, image_to_video, motion_control, lighting_control, upscaling, depth_estimation, lipsync, lora_adapter
  - 모델명 박지 X, generic 키워드 + topic 위주
  - 각 카테고리에 `cs.CV` / `cs.GR` / `cs.SD` arxiv prefix → `_collect_arxiv_categories` 자동 sweep
- ✅ `seed_vfx.py` 에 `SEED_VFX_UPDATE=1` 옵션 — 기존 카테고리 keywords 도 merge 가능

### 🧠 온톨로지 엔진 (Karpathy wiki tier — 2026-05-31)
- ✅ Arca brand/family/base_model 자동 추출 (`262eb27`) — wiki tier 자동 태깅 첫 조각
- ✅ Arca 자동 wiki 생성 (`e275bd3`) — `generate_wiki_draft` + on-demand API(`/items/{id}/generate-wiki`) + 야간배치 P0/P1 자동
- ✅ wiki `[[link]]` → 그래프 엣지 (`dd5a3f6`) — `wiki_linker` (brand 매칭 → `LineageEdge("wiki_ref")`), LineageFlow 보라 점선 표시
- ⏸ **raw tier** (ModelRawSnapshot 불변 원본) — 미구현
- ⏸ **Lint** (stale 90일+/모순/고아/깨진 wikilink) — 미구현
- ⏸ Compounding Loop (Query → wiki 자동 갱신) — 미구현

> 온톨로지 3-tier: **wiki 🟢 (엔진 가동)** / raw ❌ / outputs 🟡 (reports 테이블 O, Arca 자동리포트 ❌=Phase 5)
> 3 ops: **Ingest 🟢 (wiki 자동)** / Query ✅ (검색) / **Lint ❌**

---

## ⏭ 해야 할 일 (우선순위 순)

### ✅ A — Arca prompt 강화 (완료 `262eb27`)
- `arca_brain.py` `SCORE_SYSTEM` 카테고리 동적 주입 + brand/family/base_model/modality 추출 (generic — 모델명 하드코딩 X)
- brand → free_tags → 검색(search.py) + 카테고리 승격(promotions) 자동 연동
- ArcaPanel 에 모델 계보 칩 (brand 클릭 → 같은 계열 검색 점프)
- worker 경로(/score-update) 도 brand→free_tags 정합

### ✅ Phase 2.5 B — 이미지 annotation (완료 `39dfc95`)
- `Annotation` + `AnnotationReply` 모델 (kind pin/box/arrow/freedraw, geometry JSONB 0~1 비율, timecode_ms[C 대비])
- alembic `j0a1` — annotations + annotation_replies
- API `/attachments/{id}/annotations` + `/annotations/{id}/replies` (@mention 통합)
- Frontend `ImageAnnotator` (SVG/HTML overlay + thread 패널) + MediaViewer "주석 모드" 토글

### ✅ Phase 2.5 C — 영상 annotation (완료 `d055104`)
- `VideoAnnotator` — 영상 overlay 그리기(핀/박스/자유선) + 그릴 때 자동 일시정지
- 현재 시점 → `timecode_ms` 묶음, 타임라인 마커 클릭 → seek + 도형 표시
- MediaViewer 영상 "주석 모드" 토글, ThreadPanel 공유(@mention)
- (옵션 미구현) `/attachments/{id}/frame?t=<ms>` ffmpeg frame extract — video seek 으로 충분해 생략

### ✅ Family grouper (완료 `df8125c`)
- `jobs/family_grouper.py` — 같은 brand item 끼리 star 패턴 LineageEdge("same_family")
- night_batch grouper step 에 통합, LineageFlow 초록 점선 "계열" 라벨

### 🟢 GraphNode + GraphEdge 본격 (3-4일)
- 마스터 설계서 Phase 1 §5.1 잔여
- 자유 노드그래프 모델 + API
- Phase 3 그래프 UI 기반

### 🟢 Phase 3 — 그래프 UI (5-6일)
- reactflow 본격
- 카테고리 · 계보 · 담당자 · 라이프사이클 한 그래프
- 자유 엣지 (사용자가 그래프 위에서 연결)
- AI 추정 엣지 (Arca 제안 → confirm)

### 🟢 Phase 4 — 모터헤드 협업 (3-4일)
- external 가입 화이트리스트 (이메일 도메인)
- 가시성 정책 옵션 B (같은 프로젝트 full visibility)
- 초대 링크 UI

### 🟢 Phase 5 — Arca 주간 리포트 (4-6일)
- 일요일 22:00 자동 draft (APScheduler 이미 있음)
- `weekly_reporter.py` — 일주일 활동 종합
- draft → review → published 흐름

### 🟢 Phase 6 — 정리
- vfx-sota-monitor 원본 archive
- Cloudflare Tunnel (Tailscale funnel 보조)
- PG 자동 백업
- 운영 모니터링

---

## 🔄 진행 중 / 검증 대기 (2026-06-01 갱신)

### 코드 리뷰 이슈 — 처리 완료 (close)
| # | 내용 | 커밋 |
|---|------|------|
| #14 | 메시징 Depends() 버그 (부팅 다운) | `b24dd21` |
| #15 | SOTA/VFX 통합 후속 P1~P3 8건 | `44ee5e8`/`da1d56d` |
| #16 | 빌드 차단 + standalone auth 제거 | `e46f0e6` |
| #17 | Vite 번들 경고 (986→264kB) | `c8b9bd4` |
| #18 | attachment/annotation 권한 경계 (재오픈까지) | `a5b7a2d`/`16d8bba`/`d70f8d8` |
| #19 | diagnose.py Windows 실행 불가 | `9891625` |
| #20 | wiki tier 정합성 | `34921ee` |

### OPEN — 5090 실측 검증 대기 (검증 돌리는 중)
| # | 내용 | 상태 |
|---|------|------|
| **#6** | Gemma 파싱 실패 | **thinking off(용도별) + score 필드검증 + wiki thinking폴백** (`3e880cf`/`67642e1`). `.\diagnose.ps1 --full` → `content_len>0` + `scored==total` 확인 후 close |
| **#7** | 크롤러 hf만 동작 | **github 공식 API 교체**(`4cc6b8e`) ✅코드 / arxiv=`seed_vfx.py` 재실행 / reddit=`.env` / x=Phase3 보류 |
| **#9** | migration 안내 | start.ps1 alembic prompt 동작 확인 후 close |
| **#11** | Arca → Hermes/LDR | 3개월 후 재평가 (보류) |

### 5090 운영 액션 (git pull `4cc6b8e` 후)
1. `winget install ffmpeg` — 영상 썸네일·트랜스코딩·프레임
2. `cd backend; .\.venv\Scripts\activate; alembic upgrade head` — **j0a1(annotations) + k0a1(fps/web_relpath)** 적용
3. `python seed_vfx.py` — cs.* 카테고리 (arxiv #7). 기존 보강은 `$env:SEED_VFX_UPDATE='1'`
4. `.env` 에 `REDDIT_CLIENT_ID/SECRET` (reddit #7). GITHUB_TOKEN 있으면 github rate 완화
5. `npm --prefix frontend ci` — lockfile 동기화 (#16)
6. `.\diagnose.ps1 --full` — #6/#7 + 온톨로지(brand/wiki/wiki_ref) 한 번에 검증 → 출력 공유

### 온톨로지 엔진 — 검증 후 다음 (raw/Lint 미구현)
- wiki tier 🟢 가동 (자동 wiki + [[link]] 그래프화). raw tier(ModelRawSnapshot) ❌ / Lint ❌ 남음

---

## 🚧 보류 / 후순위

- **Phase 2.5 D 실시간 협업 annotation** — 1주+. 단일 PC 환경에 과스펙. WebSocket 신중.
- **Hermes/LDR 마이그레이션 (#11)** — 3개월 후. 지금은 Arca + Gemma4 26B 안정화.
- **외부 채팅 URL 필드 (Slack/카톡)** — 30분. 진짜 채팅 필요해질 때.
- **TestResult / Shot 모델** — VFX R&D 정밀 매트릭스 (모델 × 샷 결과). 5-6일. Phase 3 끝나고.

---

## 📂 핵심 파일 — 어디서 뭐 하는지

```
backend/
├── app/
│   ├── models/
│   │   ├── sota.py           # SotaAssignment / SotaReview (Hub 학생 배정)
│   │   ├── vfx_item.py       # Item (통합 — VFX 자동 수집 + Hub 수동 등록)
│   │   ├── project.py        # Project 3단 트리
│   │   ├── project_message.py # ProjectMessage (Phase 2 — 토론)
│   │   ├── attachment.py     # Attachment (Phase 2.5 미디어)
│   │   └── ...
│   ├── api/v1/
│   │   ├── sota.py           # /sota — 학생 배정 UI 의 API
│   │   ├── projects.py       # /projects — + activity + messages
│   │   ├── attachments.py    # /attachments — 미디어 upload/stream/thumb
│   │   └── vfx/
│   │       ├── items.py      # /vfx/items — PATCH + triage
│   │       ├── search.py     # /vfx/search — 한국어 카테고리 매칭
│   │       └── admin.py      # /vfx/admin — 야간 배치 + run-status
│   ├── services/
│   │   ├── mentions.py       # @mention 파싱 + Notification
│   │   └── storage.py        # 첨부 storage 추상화 (env base_path)
│   ├── jobs/
│   │   ├── arca_brain.py     # Gemma4 호출 (filter/score/promotion)
│   │   ├── night_batch.py    # 6 단계 야간 배치
│   │   ├── crawler.py        # 5 source 정기 크롤
│   │   └── ...
│   └── run_state.py          # In-memory 진행 상태 (RunStatusBar)
├── alembic/versions/         # f9a8 → g0a1 → h0a1 → i0a1 ...
└── seed.py / seed_vfx.py     # 시드 (19 카테고리)

frontend/
├── src/
│   ├── pages/
│   │   ├── Dashboard.tsx       # Hub 메인 (3 role view + ActiveResearchSection)
│   │   ├── DailyWrite.tsx      # 데일리 + SOTA 배정 inline
│   │   ├── Sota.tsx            # 학생 SOTA 배정 페이지
│   │   ├── ProjectDetail.tsx   # 프로젝트 (활동 피드 + 메시지 보드)
│   │   └── Login.tsx           # G30 SOTA Hub 정체성
│   ├── components/
│   │   ├── Layout.tsx          # 사이드바 (role gate)
│   │   ├── ActiveResearchSection.tsx
│   │   ├── ProjectActivityFeed.tsx
│   │   ├── ProjectMessageBoard.tsx  # 토론 + 첨부 통합
│   │   ├── AttachmentUploader.tsx + MediaViewer.tsx
│   │   └── ...
│   └── vfx/
│       ├── pages/
│       │   ├── Dashboard.tsx   # VFX 대시보드
│       │   ├── Triage.tsx      # 분류 페이지
│       │   ├── ItemDetail.tsx  # 모델 상세 (현황 + 액션)
│       │   └── ...
│       └── components/
│           ├── ItemCard.tsx + ItemTable.tsx + ViewToggle.tsx
│           ├── TriageActions.tsx + AssignModal.tsx
│           ├── RunStatusBar.tsx
│           └── ...
```

---

## 📅 진행 기록

| 날짜 | 작업 | commit / 비고 |
|------|------|---|
| 2026-04-30 | 마스터 설계서 + 통합 결정 | docs/superpowers/plans/2026-04-30 |
| 2026-05-01 | Phase 0 부트스트랩 | G30SotaHub_v2 폴더 |
| 2026-05-07 | Phase 1 통합 마이그레이션 | `47afe50` (g0a1b2c3d4e5) |
| 2026-05-07 | VFX UI 1차 (카드/표/Triage/ItemDetail) | `9e0cc00`, `8ad788c` |
| 2026-05-07 | RunStatusBar | `fd39d31` |
| 2026-05-07 | DailyWrite SOTA inline 메모 | `928ca72` |
| 2026-05-07 | Hub ActiveResearchSection | `eed2058` |
| 2026-05-08 | 이슈 #6/#7 fix + 진단 로그 | `3ce4715`, `e11adb0` |
| 2026-05-19 | SQLite 잔재 정리 (PG 호환) | `dd3c115` |
| 2026-05-19 | _parse_json truncation recovery | `c856143` |
| 2026-05-20 | start.ps1 PS5.1 호환, 포트 8011/3030 | `931d270`, `857d390`, `4a2d1b1` |
| 2026-05-20 | Phase 1A mention + 1B 활동 피드 | (commits) |
| 2026-05-21 | Phase 2 메시지 보드 | `b5a0683` |
| 2026-05-21 | 검증 매트릭스 + 6 fix | `23a604c` |
| 2026-05-21 | Login 카피 정리 | `58ccada` |
| 2026-05-21 | Phase 2.5 A — 미디어 첨부 + 뷰어 + SETUP_5090.md | `a235d5c` |
| 2026-05-21 | VFX 검색 확장 (한국어 카테고리) | `8f51693` |
| 2026-05-21 | 카테고리 9개 추가 (generic 영상/이미지/VFX) | `811a141` |
