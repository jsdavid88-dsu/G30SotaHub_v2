# PLAN — G30SotaHub v2 진행 상황 + 후속 계획

> 큰 그림 / 설계 근거: [docs/superpowers/plans/2026-04-30-vfx-integration-knowledge-graph.md](docs/superpowers/plans/2026-04-30-vfx-integration-knowledge-graph.md)

---

## 현재 상태 (2026-05-21)

- ✅ **Phase 0** — 부트스트랩 (폴더 생성, 정체성)
- ✅ **Phase 1** — DB·인프라 마이그레이션 (`g0a1b2c3d4e5_unify_sota_and_vfx_items` + 후속)
- ✅ **Phase 1.5** — VFX UI 강화 + 통합 흐름
  - 카드 ↔ 표 뷰 토글, Triage 워크플로우, ItemDetail 현황·액션, RunStatusBar
  - DailyWrite SOTA 통합 (inline 메모 → today 자동 기록)
  - Hub Dashboard "진행 중인 연구" (ActiveResearchSection)
- ✅ **Phase 2 (1단계)** — 협업 통합 메시지
  - Phase 1A: @mention 알림 (services/mentions.py)
  - Phase 1B: 프로젝트 활동 피드 (ProjectActivityFeed)
  - Phase 2: 프로젝트 메시지 보드 (ProjectMessageBoard — threaded 토론)
- ✅ 검증 — Playwright 3 역할 × 23 페이지 + 6 fix
- ⏭ **다음**: Phase 2.5 (미디어 + annotation), Phase 3 (그래프 UI), 외 ...

---

## Phase 2.5 — 미디어 + Annotation (이미지 + 영상 + 그 위에 그리기)

> **VFX 본질의 진짜 통합 기능.** Frame.io / SyncSketch 같은 패턴.

### 핵심 결정 — 저장 전략

**원칙**: Attachment 모델은 **상대 경로만** 저장 + base path 는 env 변수.

```python
class Attachment(...):
    storage_relpath: str  # "2026/05/abc.mp4" (절대 경로 아님)
    # full_path = settings.STORAGE_BASE_PATH + storage_relpath
```

env:
```
# 지금 (NAS 없음)
STORAGE_BASE_PATH=./backend/uploads/

# 나중에 NAS 마운트 후
STORAGE_BASE_PATH=M:\sota_files\
```

**NAS 이전 시**: 파일 복사 (`robocopy`) + env 변경 → 끝. DB 변경 X.

### A. 첨부 + 뷰어 (1-2일)

**Backend:**
- [ ] `Attachment` 모델 확장 — `storage_relpath`, `media_type` (image/video/other), `mime`, `size_bytes`, `width`, `height`, `duration_sec`, `thumbnail_relpath`
- [ ] `AttachmentOwnerType` 에 `project_message` 추가
- [ ] `POST /api/v1/attachments` — multipart upload (이미지/영상)
- [ ] `GET /api/v1/attachments/{id}/stream` — backend 프록시 (range request 지원, 영상 streaming)
- [ ] `GET /api/v1/attachments/{id}/thumbnail` — 이미지 썸네일 / 영상 첫 프레임 (ffmpeg)
- [ ] 영상 업로드 시 ffmpeg 으로 썸네일 생성 (5090 PC 에 `ffmpeg` 설치 필요)

**Frontend:**
- [ ] `AttachmentUploader` 컴포넌트 — drag&drop + 미리보기
- [ ] `MediaViewer` (Lightbox) — 이미지/영상 풀스크린
- [ ] `ProjectMessageBoard` 에 첨부 인라인 표시 + 클릭 시 Lightbox

### B. 이미지 annotation (+ 2-3일)

**Backend:**
- [ ] `Annotation` 모델 신규 — `id`, `attachment_id`, `author_id`, `shape_type` (pin/box/freedraw), `geometry: JSONB` (좌표), `created_at`
- [ ] `AnnotationComment` 모델 — `annotation_id`, `author_id`, `body`, threaded (parent_id 옵션)
- [ ] `/api/v1/attachments/{id}/annotations` CRUD
- [ ] @mention 통합 (services/mentions.py)

**Frontend:**
- [ ] `ImageAnnotator` 컴포넌트 — SVG overlay 위에 그리기 (pin/box/freedraw)
- [ ] 각 annotation 옆 thread 표시 + 코멘트 작성
- [ ] Lightbox 안에서 그리기 모드 토글

### C. 영상 annotation (+ 3-5일)

**Backend:**
- [ ] `Annotation.timecode_ms` 칼럼 추가 (영상용 — 특정 시점 마크)
- [ ] `/api/v1/attachments/{id}/frame?t=<ms>` — ffmpeg 으로 특정 프레임 추출 (캐시)

**Frontend:**
- [ ] `VideoAnnotator` 컴포넌트 — `<video>` + canvas overlay
- [ ] 영상 일시정지 → 그리기 모드 → annotation 저장
- [ ] 타임라인에 annotation 마커 표시 + 클릭 시 점프
- [ ] 마커별 thread comment

### 전제 — 환경

- [ ] **NAS 마운트 결정** — 지금은 `backend/uploads/` 로 시작 OK. 영상 GB 단위 들어가기 시작하면 NAS 로 이전 (env 변경 + robocopy 만).
- [ ] **ffmpeg 5090 PC 설치** — 영상 썸네일 + 프레임 추출에 필수. `winget install ffmpeg` 또는 [ffmpeg.org](https://www.ffmpeg.org/download.html) 에서 다운.
- [ ] backend uploads 폴더 `.gitignore` 처리 (이미 되어 있을 것)

### 진행 권장 순서

1. **A 먼저** — 첨부 + 뷰어 (1-2일). ffmpeg 만 있으면 NAS 안 기다림.
2. **B** — 이미지 annotation (2-3일). 영상 안 기다림.
3. **(영상 첨부 많아지면)** NAS 마운트 → env 변경 → 파일 이전
4. **C** — 영상 annotation (3-5일)
5. **D (선택)** — 실시간 협업 annotation (WebSocket, 1주+). 보류 권장.

---

## Phase 3 — 그래프 UI (마스터 설계서 §7)

- [ ] `KnowledgeGraph` 페이지 — reactflow 본격. 카테고리·계보·담당자·라이프사이클 모두 그래프.
- [ ] 노드 카드 강화 — GitHub stars / HF likes / arxiv / PWC / 담당자 / 리뷰 통합 표시
- [ ] 자유 엣지 (사용자가 그래프 위에서 노드 ↔ 노드 직접 연결)
- [ ] AI 추정 엣지 (Arca 가 자동 제안 → 사람 confirm)

---

## Phase 4 — 모터헤드 협업 (외부 가시성)

- [ ] `external` 가입 화이트리스트 (이메일 도메인 허용 목록)
- [ ] 프로젝트 가시성 정책 옵션 B (같은 프로젝트 멤버 = full visibility)
- [ ] 외부 멤버 초대 UI (교수가 이메일 입력 → 초대 링크)
- [ ] 모터헤드 모델 배정 UX 강화 (Triage `[모터헤드]` 이미 있음)

---

## Phase 5 — Arca 주간 리포트

- [ ] 일요일 22:00 KST 스케줄러 (APScheduler 이미 있음)
- [ ] `weekly_reporter.py` — Arca 가 일주일 활동 (신규 모델 / 리뷰 / 마일스톤) 종합 → draft 생성
- [ ] `Report.status` 흐름: draft → review → published
- [ ] 본인 + admin 검토 후 published 시 push 알림

---

## Phase 6 — 정리

- [ ] vfx-sota-monitor 원본 폴더 archive (참조용 read-only)
- [ ] Cloudflare Tunnel 영구 도메인 정착 (Tailscale funnel 보조)
- [ ] PG 자동 백업 (cron + pg_dump → NAS)
- [ ] 운영 모니터링 (Sentry 또는 self-hosted)

---

## 후순위 / 보류

- **#11 Arca → Hermes/LDR 마이그레이션** — 3개월 후 재평가. 지금은 Arca + Gemma4 26B 안정화 우선.
- **D 실시간 협업 annotation** — 1주+. 단일 PC 환경에 과스펙. WebSocket 도입 신중.
- **외부 채팅 URL 필드 (Slack/카톡)** — 30분 작업. 진짜 채팅 필요해질 때.

---

## GitHub 이슈 (active)

- **#6** Gemma 파싱 실패 — fix push 됨, 5090 검증 대기
- **#7** 크롤러 huggingface 만 — 진단 로그 push 됨, isolated 테스트 대기
- **#9** Phase 1 migration 안내 — 검증 후 close 가능
- **#11** Hermes/LDR 리서치 — 3개월 후 재평가 메모 후 close

---

## 진행 기록

| 날짜 | 작업 | 비고 |
|------|------|------|
| 2026-04-30 | 마스터 설계서 작성 | 통합 결정 합의 |
| 2026-05-01 | Phase 0 부트스트랩 | G30SotaHub_v2 폴더 |
| 2026-05-07 | Phase 1 통합 마이그레이션 | `g0a1b2c3d4e5_unify_sota_and_vfx_items` |
| 2026-05-07 | VFX UI 강화 (1차) | 카드/표 토글, Triage, ItemDetail |
| 2026-05-07 | RunStatusBar + DailyWrite SOTA | 두 시스템 유기적 연결 |
| 2026-05-08 | 이슈 #6/#7 fix + 진단 로그 | max_tokens 1800, SCORE_BATCH 3 |
| 2026-05-19 | SQLite 잔재 정리 (PG 호환) | json_each → jsonb_array_elements_text |
| 2026-05-20 | start.ps1 PS5.1 호환, 포트 8011/3030 | 환경 안정화 |
| 2026-05-20 | Phase 1A @mention + Phase 1B 활동 피드 | 협업 1단계 |
| 2026-05-21 | Phase 2 메시지 보드 | 통합 토론 공간 |
| 2026-05-21 | 검증 매트릭스 + 6 fix | 3 역할 × 23 페이지 |
