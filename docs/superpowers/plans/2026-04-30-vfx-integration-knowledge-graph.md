# Motorhead AI × VFX — R&D Knowledge Graph Platform

> **vfx-sota-monitor → glocal30Hub 통합 + 온톨로지 그래프 시스템**
>
> 작성일: 2026-04-30
> 상태: 사용자 합의 완료 → Phase 1 진입 직전
> 선행 문서: `vfx-sota-monitor/PLAN.md` §"Hub 통합 시 (나중)" — 이 문서가 그 후속

---

## 1. 비전 한 줄

> **"리서치 → 배치 → 테스트 → 보고 → 라이프사이클"이 하나의 지식 그래프 안에서 유기적으로 도는 R&D 협업 플랫폼**

세 시스템이 한 사이클로 묶임:
- **Arca (자동 수집·분석)** — 매일/매주 새 모델·논문·코드 발견, 그래프에 노드/엣지 자동 추가
- **사람 (실행·평가)** — 모델 배정, 직접 테스트, 영상 업로드, 댓글, 결과보고서
- **그래프 (조감)** — 분야·계보·담당자·라이프사이클이 한눈에, 신모델 → 구모델 자동 폐기 제안

---

## 2. 핵심 결정사항 (모두 확정)

| # | 결정 | 비고 |
|---|------|------|
| **1** | 단일 PC (Tailscale 깔린 5090 PC) | Web + Postgres + Ollama + 크롤러 모두 한 곳 |
| **2** | Karpathy LLM Wiki 온톨로지 채택 | 3 operations(Ingest/Query/Lint), raw/wiki/outputs 3-tier |
| **3** | 노드그래프 시각화 (reactflow) | 트리 X, 그래프 O. 분야 자유 추가/이동 |
| **4** | 노드 카드에 외부 출처 통합 표시 | GitHub / HuggingFace / arXiv / Papers With Code / X |
| **5** | 계보·담당자 그래프 연결 | 모델 ↔ 모델, 모델 ↔ 사람, 모델 ↔ 보고서 |
| **6** | Arca 주간 리포트 — 초안 자동 / 발행 수동 | 본인 + 관리자급 연구원이 검토 후 published |
| **7** | NAS 영상 저장 (네트워크 드라이브 마운트) | 용량 무제한, 백엔드 프록시 스트리밍 |
| **8** | 가시성: 옵션 B (같은 프로젝트 내 전부 공개) | 모터헤드 멤버 = `external` 역할로 가입 |
| **9** | 마이그레이션 전략: 재크롤 (SQLite 데이터 폐기) | 68개 items만 있어 다시 채우는 게 깨끗 |

---

## 3. 아키텍처 — 단일 5090 PC

```
                팀원 + 모터헤드 (외부)
                       │
                       │ HTTPS via Cloudflare Tunnel
                       ▼
┌──────────────────────────────────────────────────────────┐
│  5090 PC (24/7, Tailscale 가입됨)                          │
│                                                            │
│  Frontend (Vite, :3000)                                   │
│   ├─ Dashboard / Daily / Weekly / Projects (기존 Hub)      │
│   ├─ KnowledgeGraph (신규: reactflow 그래프 뷰)            │
│   ├─ ModelDetail (신규: 노드 카드 — GH/HF/arXiv/계보/담당) │
│   ├─ WeeklyReport (Arca 초안 → 검토 → 발행)                │
│   └─ Members / Calendar / Attendance / ...                │
│                                                            │
│  Backend (FastAPI, :8000)                                 │
│   ├─ /api/v1/auth, /users, /projects, ...   (Hub 기존)     │
│   ├─ /api/v1/sota/*           (VFX 흡수, 확장)             │
│   ├─ /api/v1/graph/*          (신규: 노드/엣지 CRUD)        │
│   ├─ /api/v1/uploads/video    (신규: NAS 프록시)            │
│   └─ APScheduler                                           │
│        ├─ 09:00 KST: 정기 크롤 (arxiv/gh/hf/reddit/x)      │
│        ├─ 21:00 KST: 야간 배치 (Arca 분석·엣지 추정)       │
│        └─ 일요일 22:00 KST: 주간 리포트 초안 생성          │
│                                                            │
│  PostgreSQL 16  (단일 DB, 모든 데이터)                      │
│  Ollama + Gemma 4 26B (5090 GPU 직접 사용)                 │
│                                                            │
│  M:\sota_files\  (NAS 네트워크 드라이브 마운트)             │
└──────────────────────────────────────────────────────────┘
```

**Tailscale 역할 변경:**
- 기존: 메인 PC ↔ AI Cluster PC 분산 통신용
- 통합 후: 본인이 외부에서 PC 원격 관리할 때만 사용 (옵션). 외부 사용자 접근은 Cloudflare Tunnel.

---

## 4. Karpathy LLM Wiki 온톨로지 매핑

사용자의 글로벌 Vault Protocol(`C:\Users\USER\.claude\CLAUDE.md`)을 모델·연구 도메인에 적용.

### 4.1 3-Tier 데이터 분리

| Tier | Vault 위치 | DB 매핑 | 의미 |
|------|-----------|---------|------|
| **raw** | `Vault/07_Learning/{도메인}/raw/` | `model_raw_snapshots` (불변) | 처음 발견된 원문 (arxiv abstract, github README, HF model card, X 트윗 본문). **수정 금지** |
| **wiki** | `Vault/01_Projects/`, `wiki/` | `sota_items` (수정됨, version 증가) | 우리가 정리한 지식. wikilink 본문 포함 |
| **outputs** | `Vault/07_Learning/{도메인}/outputs/{날짜}_{토픽}.md` | `reports` 테이블 | 주간 리포트, 분석, 비교 |

### 4.2 3 Operations

#### **Ingest** (자동, 크롤러·야간 배치)
```
크롤러 → 새 모델 발견
  1. model_raw_snapshots 저장 (불변)
  2. sota_items 신규 행 생성 (또는 group_id로 기존과 묶임)
  3. Arca: 자동 description 50자 생성
  4. Arca: 다른 모델과의 관계 추정 → graph_edges 추가 (상태: AI 추정)
  5. Project(분야) 자동 분류 — 키워드 + 임베딩 매칭
  6. logs append
```

#### **Query** (사용자 검색·조회)
```
사용자 검색 / 그래프 탐색
  1. memory(세션) → wiki(sota_items + graph_edges) → raw(model_raw_snapshots) 순 조회
  2. 답변 후 의미있는 탐색은 reports로 저장
  3. 새로운 발견 시 wiki(sota_items.wiki_body) 업데이트 ← Compounding Loop
```

#### **Lint** (주간 헬스체크)
```
일요일 22:00 → 다음 항목 자동 검사
  1. 90일 이상 미수정 노드 → status: 🟡 stale 태그
  2. 깨진 wikilink → 수정 또는 제거
  3. 본문에 wikilink 없는 고아 노드 → 자동 추가 시도
  4. 같은 모델에 대한 모순 데이터 → status: 🔴 contradicted, 사람 검토 알림
  5. raw 있는데 wiki 없음 → 자동 wiki 초안 생성
```

### 4.3 Confidence 태그 (사용자 Vault 패턴 그대로)

```yaml
status: 🟢 verified | 🟡 stale | 🔴 contradicted | ⚪ unverified
```

모든 SotaItem과 GraphEdge에 부착. UI에서 색상 표시.

---

## 5. 데이터 모델 (Postgres)

### 5.1 정형 테이블 변경/추가

#### `Project` 변경 — self-ref 추가
```python
class Project(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "projects"
    name: Mapped[str]
    parent_id: Mapped[uuid.UUID | None] = ForeignKey("projects.id")  # 신규
    project_type: Mapped[str]  # "umbrella" | "discipline" | "initiative"
    description: Mapped[str | None]
    # 기존 필드 유지
```

3-depth 구조:
- L1: `모터헤드AIxVFX` (umbrella)
- L2: `video_matting`, `head_swap`, `3dgs`, ... (discipline) — 분야
- L3: `MatAnyone2 채택 검토` (initiative) — 옵션, 사용자 정의

**근데 분야는 노드그래프로도 표현됨** — 따라서 `Project` 테이블은 **administrative grouping** 역할 (권한·배정 단위), 그래프는 **인지적 표현** 역할로 분리.

#### `SotaItem` 대대적 확장 (VFX `Item` 흡수)
```python
class SotaItem(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "sota_items"

    # === Identity ===
    title: Mapped[str]
    slug: Mapped[str]  # URL용, 자동 생성

    # === Karpathy 온톨로지 ===
    description: Mapped[str]  # 50자 핵심 (Arca 자동 생성, 사람 수정 가능)
    wiki_body: Mapped[str]  # markdown, [[wikilink]] 포함
    status: Mapped[str]  # verified|stale|contradicted|unverified
    last_updated: Mapped[datetime]
    version: Mapped[int]  # 수정 시마다 증가

    # === 외부 참조 (노드 카드 표시용) ===
    refs: Mapped[dict] = JSONB  # {github, huggingface, arxiv, papers_with_code, x, project_page, demo}
    # 예: {"github": "https://github.com/...", "huggingface": null, "arxiv": "2412.12345"}

    # === 라이프사이클 ===
    lifecycle_status: Mapped[str]
    # research → dev → testing → production → deprecated
    replaced_by_id: Mapped[uuid.UUID | None]  # → SotaItem (구버전 → 신버전)
    deprecated_at: Mapped[datetime | None]
    deprecated_reason: Mapped[str | None]

    # === 분야·프로젝트 ===
    project_id: Mapped[uuid.UUID | None]  # 어느 분야(L2)에 속하는지

    # === 점수·메타데이터 (VFX Item 흡수) ===
    keyword_score: Mapped[int] = 0
    llm_score: Mapped[int] = 0
    llm_reason: Mapped[str | None]
    priority: Mapped[str | None]  # P0/P1/P2/P3/WATCH
    item_metadata: Mapped[dict] = JSONB  # stars, downloads, likes 등
    free_tags: Mapped[list] = JSONB  # Arca 자유 태그
    group_id: Mapped[uuid.UUID | None]  # → SotaItemGroup (교차 소스 그룹핑)

    # === 관계 ===
    assignments = relationship("SotaAssignment")  # 기존 유지
    comments    = relationship("Comment")        # polymorphic
    attachments = relationship("Attachment")     # polymorphic — 영상 등
```

#### `model_raw_snapshots` 신규 (불변)
```python
class ModelRawSnapshot(UUIDMixin, Base):
    sota_item_id: Mapped[uuid.UUID]
    source: Mapped[str]  # arxiv|github|huggingface|reddit|x|...
    captured_at: Mapped[datetime]
    raw_content: Mapped[str]  # 원본 (markdown/json/text)
    raw_url: Mapped[str]  # 출처
    # 수정 금지 — append-only
```

#### `graph_nodes` 신규 (다형 인덱스)
```python
class GraphNode(UUIDMixin, Base):
    """그래프 노드 — 기존 정형 테이블 행을 노드로 노출하는 인덱스"""
    node_type: Mapped[str]  # sota_item | project | user | report | tag
    ref_id: Mapped[uuid.UUID]  # 정형 테이블의 PK
    label: Mapped[str]  # 캐시
    meta: Mapped[dict] = JSONB  # 시각화용 (color, icon, position)
```

#### `graph_edges` 신규
```python
class GraphEdge(UUIDMixin, TimestampMixin, Base):
    source_node_id: Mapped[uuid.UUID]
    target_node_id: Mapped[uuid.UUID]
    edge_type: Mapped[str]  # 아래 표 참조
    weight: Mapped[float] = 1.0
    status: Mapped[str]  # verified|unverified  (Arca 추정 vs 사람 확정)
    created_by: Mapped[str]  # arca|user_id
    meta: Mapped[dict] = JSONB  # 근거 (논문 인용, 키워드 매칭 등)
```

#### `Report` 확장 — status 추가
```python
class Report(UUIDMixin, TimestampMixin, Base):
    # 기존 필드 유지
    report_type: Mapped[str]  # weekly | project | student | sota_weekly  (신규)
    status: Mapped[str]  # draft | review | published  (신규)
    target_period_start: Mapped[date]
    target_period_end: Mapped[date]
    target_project_id: Mapped[uuid.UUID | None]
    body_markdown: Mapped[str]  # Arca 초안 + 사람 수정
    arca_seed_data: Mapped[dict] = JSONB  # 원본 분석 데이터 (수정 시에도 보존)
    reviewed_by: Mapped[uuid.UUID | None]
    published_at: Mapped[datetime | None]
```

### 5.2 그래프 엣지 종류 (edge_type)

| edge_type | source → target | 의미 | 생성자 |
|-----------|----------------|------|--------|
| `replaces` | SotaItem → SotaItem | 신모델이 구모델 폐기 | Arca 추정 → 사람 확정 |
| `baseline_of` | SotaItem → SotaItem | 이거 기반으로 만들어짐 | 논문 인용 분석 |
| `competes_with` | SotaItem ↔ SotaItem | 같은 분야 경쟁 | Arca |
| `extends` | SotaItem → SotaItem | 확장/개선판 | Arca |
| `cites` | SotaItem → SotaItem | 논문 인용 (Semantic Scholar) | 자동 |
| `belongs_to` | SotaItem → Project | 분야 소속 | Arca + 사람 |
| `assigned_to` | SotaItem → User | 누가 실험 중 | 사람 (배정) |
| `authored_by` | Report → User | 보고서 작성자 | 사람 |
| `about` | Report → SotaItem | 보고서가 다루는 모델 | 자동 |
| `tagged` | SotaItem → Tag | 자유 태그 | Arca |
| `mentioned_in` | SotaItem → Comment/DailyBlock | 어디서 언급됨 | 자동 (NLP) |

---

## 6. 노드 카드 UI 명세

모델 노드 클릭 시 우측 패널 또는 모달:

```
┌─ MatAnyone 2 ────────────────────── 🟢 verified · v3 ─┐
│                                                          │
│  📝 Description (50자)                                   │
│  Video matting SOTA, alpha matte 정확도 +30%, 4K 지원   │
│                                                          │
│  🔗 출처                                                  │
│   • arXiv:    [2412.12345]                              │
│   • GitHub:   [hkchengrex/MatAnyone2] ⭐ 1.2k           │
│   • HuggingFace: [hkchengrex/matanyone-2]               │
│   • Papers With Code: [matanyone-2]                     │
│   • Project:  https://matanyone.github.io                │
│   • Demo:     [HF Spaces]                               │
│                                                          │
│  🌳 계보                                                  │
│   ← baseline: [MatAnyone 1]                             │
│   ← extends:  [Robust Video Matting]                    │
│   → replaces: [VideoMatting v3] (deprecated 2026-04)    │
│   ↔ competes: [VideoMaMa]                               │
│                                                          │
│  👥 담당자                                                │
│   • 학생 A (assigned · 실험 중)  ─── 마지막 업데이트 3일 전 │
│   • 모터헤드 B (assigned · 4K 테스트)                     │
│                                                          │
│  📊 라이프사이클                                          │
│   research → dev → 🔵 testing → production → deprecated │
│                                                          │
│  🎬 첨부 영상 (NAS)                                        │
│   • test_4k_complex_bg.mp4 (학생 A · 2026-04-25)         │
│   • motorhead_skin_test.mp4 (모터헤드 B · 2026-04-27)    │
│                                                          │
│  💬 댓글 (스레드, 12개)                                   │
│   교수: 페일 케이스 더 모아주세요                           │
│   학생 A: 5개 케이스 추가했습니다                          │
│   ...                                                    │
│                                                          │
│  📚 wiki_body (펼치기)                                    │
│   - 핵심 기여                                             │
│   - 구현 노트                                             │
│   - VFX 적용 시 주의사항                                   │
│   - [[VOID]]에서 못한 어려운 케이스 처리                   │
│                                                          │
│  🗃️ raw 스냅샷 (불변, 펼치기)                              │
│   • arxiv abstract (2026-04-12 캡처)                    │
│   • github README excerpt                               │
└──────────────────────────────────────────────────────────┘
```

---

## 7. 권한 모델 (옵션 B 적용)

| 리소스 | admin | professor | student | external (모터헤드) |
|--------|-------|-----------|---------|--------------------|
| **그래프 전체 보기** | ✅ | ✅ | 본인 프로젝트 멤버인 노드 | 본인 프로젝트 멤버인 노드 |
| **모델 노드 보기** | ✅ | ✅ | 같은 프로젝트면 ✅ | **같은 프로젝트면 ✅** |
| **댓글 작성** | ✅ | ✅ | 같은 프로젝트면 ✅ | **같은 프로젝트면 ✅** |
| **영상 업로드** | ✅ | ✅ | 같은 프로젝트면 ✅ | **같은 프로젝트면 ✅** |
| **모델 배정** | ✅ | ✅ | ❌ | ❌ |
| **라이프사이클 변경** | ✅ | ✅ | ❌ | ❌ |
| **분야 추가/삭제** | ✅ | ✅ | ❌ | ❌ |
| **주간 리포트 발행** | ✅ | ✅ (검토자) | ❌ | ❌ |
| **다른 프로젝트 모델** | ✅ | ✅ | ❌ | ❌ |

**모터헤드 멤버 가입 흐름:**
1. 모터헤드 도메인 화이트리스트 (`@motorhead.ai` 등) → Google OAuth 가입 시 자동 `external` 역할
2. 관리자가 `motorhead-vfx` 프로젝트의 멤버로 추가 → 그 시점부터 같은 프로젝트 안 모든 모델 보임
3. 자기 분야 외 다른 분야는 보이지 않음 (다른 프로젝트라서)

---

## 8. Arca 주간 리포트 명세

**스케줄:** 일요일 22:00 KST (그 주 일~토 데이터 집계)

### 8.1 사용자 워딩 직역
> "이 분야 카테고리별로 새로 나온 건 이거이거에요. 코드가 있어요 얘는 없어요 쭉쭉 보고, 저번주에 이 모델은 누가 이렇게 테스트를 해봤어요. 좀 더 볼지, 아니면 버릴지 봅시다."

### 8.2 리포트 구조 (markdown 출력 → DB 저장 → UI 렌더)

```markdown
# 주간 SOTA 리포트 — 2026-W17 (4/22 ~ 4/28)
> Arca 자동 생성 · 검토 대기 · 발행 전

## 분야별 새 모델

### video_matting (5건)
| 모델 | arXiv | GitHub | HF | 한 줄 |
|------|-------|--------|----|----|
| MatAnyone3 | ✅ | ✅ ⭐3.2k | ✅ | MatAnyone2 대비 30% 빠름, 4K 지원 |
| FastMat | ✅ | ❌ | ❌ | **코드 없음** — 추적만 |
| ... |

### head_swap (3건)
...

## 지난주 우리 팀 활동

### MatAnyone2 (학생 A)
- 4K 복잡 배경 테스트 → 영상 첨부됨
- 결론: 단순 배경에서는 SOTA, 복잡 배경 페일 케이스 다수
- 다음 주: VideoMaMa와 비교 예정

### VOID (모터헤드 B)
- 피부 디테일 테스트 → 영상 첨부됨
- 결론: 머리카락 경계 흐림 문제

## Arca 권고사항

### 채택 검토 추천
- **MatAnyone3** — MatAnyone2 자리 대체 후보. baseline 일치, 성능 +30%.

### 폐기(deprecate) 검토 추천
- **VideoMatting v3** — MatAnyone 시리즈가 모든 벤치에서 우세. 6개월 미사용.

### 추적 계속
- **FastMat** — 코드 공개되면 재평가
- **DirectSwap** — 라이센스 불명확, 확인 필요

## 그래프 통계
- 신규 노드: 8개 (논문 5, GitHub 2, HF 1)
- 신규 엣지: 12개 (replaces 1, baseline_of 4, cites 7)
- 🟡 stale 노드: 23개 (90일 미수정)
- 🔴 contradicted: 1개 — `VideoMatting v3` (라이센스 정보 충돌)

## 다음 주 자동 작업
- [ ] FastMat 코드 공개 모니터링
- [ ] MatAnyone3 ↔ MatAnyone2 자동 비교 영상 생성
- [ ] VideoMatting v3 deprecate 알림 (관리자 승인 필요)
```

### 8.3 발행 워크플로

```
일 22:00 → Arca 초안 생성 (status=draft)
   ↓
admin / professor 알림 (in-app + 푸시)
   ↓
검토 페이지에서 수정 (Markdown 에디터, arca_seed_data 보존)
   ↓
"발행" 버튼 → status=published, 모든 사용자에게 노출
   ↓
모터헤드 멤버에게도 노출 (자기 프로젝트 리포트면)
```

---

## 9. NAS 영상 저장 명세

### 9.1 마운트
- 5090 PC에 NAS 네트워크 드라이브 마운트 → `M:\sota_files\`
- 권한: Hub 백엔드만 읽기/쓰기 (서비스 계정)

### 9.2 디렉토리 구조
```
M:\sota_files\
├─ models\
│   └─ {sota_item_id}\
│       ├─ {uuid}_test_4k.mp4
│       ├─ {uuid}_input_pair.zip
│       └─ thumbnails\
│           └─ {uuid}_thumb.jpg
├─ reports\
│   └─ {report_id}\
│       └─ embedded_assets\
└─ raw_snapshots\
    └─ {snapshot_id}.json
```

### 9.3 백엔드 프록시 (필수)
- 외부 사용자(모터헤드)가 NAS 직접 접근 X (보안)
- 모든 영상은 백엔드 통해 스트리밍: `GET /api/v1/uploads/video/{attachment_id}`
- Range header 지원 (HTML5 video seek)
- 권한 체크: 첨부의 owner(SotaItem) → project → 사용자가 멤버인지

### 9.4 업로드
- multipart/form-data, 청크 업로드 (큰 파일 대비)
- 백엔드가 받아서 NAS에 저장 + Attachment 행 생성
- 썸네일 자동 생성 (ffmpeg, 첫 프레임)

---

## 10. Phase 분할 (실제 작업 순서)

```
Phase 0  ← 지금 (이 문서가 그것)
  비전·스키마·온톨로지 설계 합의

Phase 1: DB·인프라 마이그레이션         (3-4일)
  ├─ Hub Postgres에 새 테이블 (graph_nodes, graph_edges, model_raw_snapshots)
  ├─ Project 모델 self-ref 추가
  ├─ SotaItem 확장 (VFX Item 필드 흡수)
  ├─ Report 확장 (status, arca_seed_data)
  ├─ Alembic 마이그레이션 작성
  ├─ 시드: motorhead-vfx 프로젝트 + 10개 분야(VFX 카테고리) 노드
  └─ NAS 마운트 검증

Phase 2: VFX 백엔드 흡수                (4-5일)
  ├─ /api/v1/sota/* 라우터 (조회·필터·검색)
  ├─ /api/v1/sota/items/{id}/lifecycle (상태 변경)
  ├─ /api/v1/graph/nodes, /edges (CRUD)
  ├─ /api/v1/uploads/video (NAS 프록시)
  ├─ APScheduler 통합 (Hub lifespan에)
  ├─ VFX sources/* 코드 그대로 이식 (arxiv/github/hf/reddit/x)
  ├─ Arca 코드 이식 (worker.py, researcher.py, prompts.py)
  ├─ Ollama 클라이언트는 localhost:11434 (같은 PC)
  ├─ 인증 어댑터 — 모든 sota 라우터에 Depends(get_current_user)
  └─ 가시성 필터 (project_id 기반)

Phase 3: 그래프 UI                      (5-6일)
  ├─ KnowledgeGraph 페이지 (reactflow)
  │   ├─ 모드: 전체 / 분야별 / 모델 1-hop / 라이프사이클
  │   └─ 클릭 → 노드 카드
  ├─ ModelDetail 페이지 (노드 카드 풀 버전)
  ├─ 영상 업로드 / 썸네일 / 인라인 재생
  ├─ 댓글 스레드 (Hub Comment 모델 polymorphic 활용)
  ├─ 라이프사이클 토글 (admin/professor만)
  └─ 분야 노드 추가/이동 (드래그)

Phase 4: 모터헤드 협업 UX               (3-4일)
  ├─ external 가입 화이트리스트 도메인
  ├─ 프로젝트 멤버 추가 UI (admin 페이지)
  ├─ 가시성 정책 적용 (라우터·프론트 양쪽)
  ├─ 모델 배정 워크플로 (사람 → 모델 엣지)
  └─ 알림 — 본인에게 새 배정/댓글/리뷰 요청

Phase 5: Arca 주간 리포트               (4-6일)
  ├─ 일요일 22:00 스케줄러
  ├─ 분야별 신규/코드유무 자동 집계
  ├─ 지난주 사람 활동 (DailyBlock + 영상 첨부 + 댓글) 종합
  ├─ deprecate 추천 로직 (Arca tool calling)
  ├─ 초안 → 검토 → 발행 UI
  └─ 발행 후 푸시 알림

Phase 6: 정리                            (2-3일)
  ├─ vfx-sota-monitor 폐기 (코드 보관, 서비스 종료)
  ├─ Cloudflare Tunnel을 Hub로 일원화
  ├─ 백업 스크립트 (Postgres + NAS 인벤토리)
  ├─ Vault에 시스템 노드 추가 (Karpathy ingest)
  └─ 사용자 매뉴얼 (모터헤드용 onboarding)

총: 21-28일 (약 4주)
```

각 Phase 끝나면 사용 가능한 산출물 — 운영 멈추지 않음.

---

## 11. 마이그레이션 전략 — "재크롤"

VFX SQLite 데이터 (572KB, items 68개 / feed_items 210개 / comments 1개 테스트 / lineage_edges 3개) 는 다음 이유로 **이행하지 않고 폐기 + 재크롤**:

- **데이터 작음** — 재크롤 1회로 복구
- **스키마 대대적 변경** — Integer PK → UUID, JSON → JSONB, 새 필드 다수
- **재크롤 시 더 풍부** — 그동안 추가된 새 모델까지 같이 들어옴
- **comments 1개·lineage 3개**는 의미 없음

**예외:** 사용자 의도가 들어간 데이터가 있다면(category_suggestions 0건, submissions 2건) 수동 백업 → Phase 2 끝에 import.

---

## 12. 위험요소 & 완화

| 위험 | 영향 | 완화 |
|------|------|------|
| 5090 PC 단일 장애점 | 전체 다운 | 일일 Postgres 자동 덤프 → NAS, 위클리 풀 백업 |
| LLM 부하 → 웹 응답 느림 | UX 저하 | 모든 LLM 작업 야간 배치만, 사용자 직접 트리거 LLM 호출 X (Phase 5까지) |
| NAS 외부 노출 | 영상 유출 | 직접 접근 차단, 모든 접근은 백엔드 프록시 + JWT |
| 모터헤드 멤버 가입 악용 | 무단 접근 | 도메인 화이트리스트 + admin 수동 승인 |
| 그래프 노드 폭증 → reactflow 성능 | UI 멈춤 | 노드 1000개 이하 유지, 분야별 페이징 |
| Arca 주간 리포트 오류 | 잘못된 권고 | draft 검토 의무, arca_seed_data 보존으로 감사 가능 |
| 마이그레이션 중 Hub 다운타임 | 학생 사용 차단 | 모든 변경은 backwards-compat alembic, 야간 무중단 적용 |
| Karpathy 온톨로지 학습 비용 | 사용자 혼란 | UI에 raw/wiki 명시 표기, 첫 onboarding 가이드 |

---

## 13. 다음 액션 (Phase 1 진입)

이 문서 사용자 승인 후:

1. **Hub 새 브랜치 생성** — `feat/vfx-integration-phase-1`
2. **Alembic 마이그레이션 작성** — 위 5장 스키마
3. **모델·스키마 정의** — sota_items 확장, graph_nodes/edges 신규
4. **시드 데이터** — `motorhead-vfx` umbrella + 10개 discipline 노드
5. **NAS 마운트 매뉴얼** — Windows 네트워크 드라이브 영구 매핑
6. **VFX 사이드 PLAN.md에 통합 진행 표시** — `Hub 통합 시` 섹션을 "진행 중"으로 갱신

---

## 14. 부록 — 외부 참조

### Karpathy LLM Wiki (영감 출처)
- gist:442a6bf — gist 식별자, 사용자 글로벌 CLAUDE.md에 인용

### 사용자의 Vault 프로토콜
- `Z:\Antigravity_prj\Vault\00_Master\WIKI_PROTOCOL.md` — 본 문서의 토대

### 선행 프로젝트
- `vfx-sota-monitor/PLAN.md` — Phase A-E 완료 분석
- `glocal30Hub/CLAUDE.md` — Hub 아키텍처 가이드
- `glocal30Hub/docs/superpowers/plans/2026-04-20-announcement-feed-push.md` — 가장 최근 plan, 패턴 참고

---

**합의 시그니처:**
- [ ] 사용자 — 본 비전·결정·Phase 분할에 동의
- [ ] 다음 단계: `Phase 1: DB·인프라 마이그레이션` 즉시 착수

