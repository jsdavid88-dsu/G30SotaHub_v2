# G30SotaHub v2 — R&D Knowledge Graph Platform

> **"리서치 → 배치 → 테스트 → 보고 → 라이프사이클" 이 하나의 지식 그래프 안에서 유기적으로 도는 R&D 협업 플랫폼**

연구실(동서대 Red Cat Gang) + 외부 협업사(모터헤드) 가 한 공간에서 SOTA 모델을 자동 발견·테스트·보고·폐기하는 통합 플랫폼.

---

## ⚡ 빠른 시작 (5090 PC 클론 후 첫 셋업)

### 사전 요구
- **Windows 10/11**, Python 3.12+, Node 22+, Docker Desktop
- (선택) **Ollama** — Gemma 4 자동 분석을 쓰려면. `ollama pull gemma4:26b`

### 한 방 설치
```powershell
git clone https://github.com/jsdavid88-dsu/G30SotaHub_v2.git
cd G30SotaHub_v2

# 1회만 — 의존성·DB·시드 자동 셋업
.\setup.ps1

# 매번 — 백엔드/프론트/DB 기동 (3개 PowerShell 창 자동으로 띄움)
.\start.ps1
```

접속:
- **Frontend** http://localhost:3000 — Hub 일상 협업 (대시보드, 데일리, 프로젝트, 캘린더, ...)
- **VFX SOTA**  http://localhost:3000/vfx — VFX 자동 수집 + 카테고리 + 계보 그래프 + 피드 + 제보
- **API 문서** http://localhost:8000/api/docs

종료:
```powershell
.\stop.ps1   # DB 컨테이너 정지. 백/프론트 창은 각각 Ctrl+C
```

---

## 🧩 통합 구성 — 두 시스템이 한 백엔드에서 같이 돈다

| 영역 | 출처 | 설명 |
|------|------|------|
| **연구실 협업** (Hub 베이스) | `glocal30Hub` | Google OAuth, 데일리 로그·블록, 주간 노트, 프로젝트·태스크(칸반), 출결, 공지사항, 푸시, 캘린더 동기화, 보고서, SOTA 배정·리뷰 |
| **자동 SOTA 수집** (VFX 흡수) | `vfx-sota-monitor` | arXiv / GitHub / HuggingFace / Reddit / X 자동 크롤, 키워드 스코어링, Arca AI 에이전트 분석, 카테고리 자동 태깅, 기술 계보 그래프, 사용자 제보 큐 |

같은 Postgres DB · 같은 FastAPI · 같은 Vite 앱 · 같은 포트(3000/8000). 두 인증은 일단 분리 (Phase 4 에서 통합).

---

## 🗺 라우트 / API

### Frontend
| 경로 | 화면 |
|------|------|
| `/` | Hub 대시보드 (역할별) |
| `/daily/write`, `/daily/feed` | Hub 일일 활동 |
| `/weekly`, `/projects`, `/calendar`, `/attendance` | Hub 협업 |
| `/sota`, `/reports`, `/admin`, `/profile` | Hub 관리 |
| **`/vfx`** | VFX 대시보드 (10 카테고리, SOTA 풀) |
| **`/vfx/feed`** | VFX 실시간 피드 |
| **`/vfx/timeline`** | VFX 타임라인 |
| **`/vfx/graph`** | VFX 기술 계보 그래프 (reactflow) |
| **`/vfx/category/:slug`** | 카테고리 상세 |
| **`/vfx/item/:id`** | 모델/논문 상세 + 댓글 |
| **`/vfx/submit`** | URL/키워드 제보 |
| **`/vfx/search`** | VFX 통합 검색 |

### Backend API
- `GET /api/v1/users`, `/projects`, `/daily-blocks`, ... (Hub 기존)
- `GET /api/v1/vfx/items`, `/categories`, `/feed`, ... (VFX 흡수, prefix `/vfx`)
- 전체: http://localhost:8000/api/docs

---

## 🤖 AI Cluster Worker (Gemma 4 자동 분석)

VFX 의 야간 배치는 두 가지 모드:

**A) 같은 5090 PC 에 Ollama 깔린 경우 (권장)**
```powershell
ollama pull gemma4:26b
# .env 의 OLLAMA_BASE_URL=http://localhost:11434, OLLAMA_MODEL=gemma4:26b
# Hub 백엔드의 APScheduler 가 자동 호출 (21:00 KST 야간 배치)
```

**B) 별도 GPU PC 에서 Ollama 분리 운용 (Tailscale 등)**
```powershell
cd ai_cluster_worker
copy config.example.yaml config.yaml
# config.yaml 편집: MAIN_PC_URL=http://<5090-ip>:8000
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python worker.py --once   # 또는 스케줄링
```

---

## 📅 자동 스케줄 (APScheduler — 백엔드와 함께 자동 시작)

| 시간 (KST) | 작업 |
|----------|------|
| 09:00 | 정규 크롤 (arXiv / GitHub / HuggingFace / Reddit / X) + 키워드 스코어링 |
| 12:00, 18:00 | 피드 크롤 (YouTube RSS / HF Trending / Reddit hot) |
| 21:00 | 야간 풀 배치: 제보 처리 + Gemma4 피드 필터링 + Gemma4 스코어링 + 그룹핑 + 미분류 태그 집계 |
| (예정) 일요일 22:00 | Arca 주간 리포트 초안 (Phase 5) |

비활성화: `.env` 에 `SCHEDULER_ENABLED=false`.

---

## 📜 비전과 로드맵

마스터 설계서: [docs/superpowers/plans/2026-04-30-vfx-integration-knowledge-graph.md](docs/superpowers/plans/2026-04-30-vfx-integration-knowledge-graph.md)

| Phase | 내용 | 상태 |
|-------|------|------|
| 0 | 부트스트랩 + repo 생성 | ✅ |
| **0.5** | **VFX 코드 통합 (이 커밋)** | ✅ |
| 1 | 깔끔한 DB 스키마 (Project 트리·SotaItem 통합·GraphNode/Edge·ModelRawSnapshot) | ⏭ 다음 |
| 2 | 모델·인증 진짜 통합 (VFX prefix 정리, ItemComment ↔ Hub Comment 통합 등) | — |
| 3 | 노드그래프 UI 강화 + 노드 카드 (GitHub/HF/arXiv 통합 표시) | — |
| 4 | 모터헤드 협업 UX (external 가입, 가시성 정책) | — |
| 5 | Arca 주간 리포트 (자동 초안 → 검토 → 발행) | — |
| 6 | vfx-sota-monitor 폐기 + 백업 자동화 | — |

상세 진행: [PLAN.md](PLAN.md)

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI 0.115 + SQLAlchemy 2.0 (async) + PostgreSQL 16 |
| Frontend | React 19 + TypeScript 5.9 + Vite 7 + Tailwind 4 |
| Graph UI | reactflow 11 + recharts 2 |
| Auth | Google OAuth (Authlib) + JWT |
| Migration | Alembic |
| Crawler | crawl4ai, praw, BeautifulSoup, httpx |
| LLM (Arca) | Ollama + Gemma 4 26B |
| Scheduler | APScheduler |
| Storage | NAS 네트워크 드라이브 (영상 — Phase 3) |
| Deploy | 단일 5090 PC + Cloudflare Tunnel |

---

## 📂 디렉토리 구조 (통합 후)

```
G30SotaHub_v2/
├─ backend/
│  ├─ app/
│  │  ├─ api/v1/            # Hub 라우터 + api/v1/vfx/ (VFX 11개)
│  │  ├─ models/            # Hub 모델 + vfx_*.py (9개)
│  │  ├─ schemas/           # Hub 스키마 + schemas/vfx/ (8개)
│  │  ├─ sources/           # VFX 크롤러 (arxiv/github/hf/reddit/x)
│  │  ├─ scoring/           # VFX 키워드 스코어링
│  │  ├─ jobs/              # VFX 백그라운드 (이전 vfx tasks/, scheduler 포함)
│  │  ├─ services/          # Hub services (google_calendar, notifications)
│  │  ├─ core/              # Hub 암호화
│  │  ├─ auth_vfx.py        # VFX 익명 모드 (Phase 4 까지 한정)
│  │  ├─ dependencies.py    # Hub JWT 인증
│  │  ├─ config.py          # 통합 Settings
│  │  └─ main.py            # 통합 FastAPI app
│  ├─ alembic/versions/     # 16개 (Hub 11 + VFX 5)
│  ├─ seed.py               # Hub 시드 + VFX 카테고리 시드 자동 호출
│  └─ seed_vfx.py
├─ frontend/
│  └─ src/
│     ├─ App.tsx            # /vfx/* 라우트로 VfxApp mount
│     ├─ pages/, components/, contexts/, hooks/   # Hub
│     └─ vfx/               # VFX 전체 (api, components, pages)
│        ├─ App.tsx         # nested router
│        ├─ api/client.ts   # baseURL: /api/v1/vfx
│        ├─ components/, pages/
├─ ai_cluster_worker/       # 별도 GPU PC 에서 운용 시 (옵션)
├─ docs/superpowers/plans/
├─ docker-compose.yml       # db + (옵션) backend + frontend 컨테이너
├─ setup.ps1, start.ps1, stop.ps1
└─ README.md, CLAUDE.md, PLAN.md, .env.example
```

---

## 📂 원본 보존 (참조용, 변경 금지)

- `Z:\Antigravity_prj\glocal30Hub\` — Hub 원본
- `Z:\Antigravity_prj\vfx-sota-monitor\` — VFX 원본

> **이 폴더(G30SotaHub_v2) 가 진본**. 두 원본은 역사적 참조용.

---

## 🔧 주의사항

- **첫 실행 시 alembic 마이그레이션 실패 가능** — VFX 마이그가 SQLite 기준으로 작성되어 Postgres 호환 미검증. 실패 시 issue 등록 또는 Phase 1 마이그 정비 진행.
- **ItemComment vs Hub Comment** — 충돌 회피로 VFX 의 `Comment` 모델을 `ItemComment` 로 리네임함 (테이블 `item_comments`). API 호환성은 유지.
- **VFX 영역은 익명 접근** — `/vfx/*` 가 Hub 의 ProtectedRoute 밖에 있어 로그인 없이 접근 가능. Phase 4 에서 통합 인증 적용 예정.
- **포트 3000 Vite 충돌** — 기존 Hub 가 3000 사용 중이면 다른 프로세스 종료 후 `start.ps1`.

---

## 🪪 라이선스

Internal — Red Cat Gang / Dongseo University · 모터헤드 협업
