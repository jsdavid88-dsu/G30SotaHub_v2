# G30SotaHub v2 — R&D Knowledge Graph Platform

> **"리서치 → 배치 → 테스트 → 보고 → 라이프사이클" 이 하나의 지식 그래프 안에서 유기적으로 도는 R&D 협업 플랫폼**

연구실(동서대 Red Cat Gang) + 외부 협업사(모터헤드) 가 한 공간에서 SOTA 모델을 자동 발견·테스트·보고·폐기하는 통합 플랫폼.

---

## ⚡ 빠른 시작 (5090 PC 클론 후 첫 셋업)

### 사전 요구

| 종류 | 필수 / 선택 | 비고 |
|------|------------|------|
| Windows 10/11 | 필수 | Linux/macOS 도 동작 (start.ps1 만 다시) |
| Python 3.12+ | 필수 | `python --version` |
| Node 22+ | 필수 | `node --version` |
| Docker Desktop | 필수 | Postgres 컨테이너용 (또는 native PostgreSQL 16 직접 설치) |
| **Ollama + gemma4:26b** | **선택 (강력 권장)** | **[야간 배치] 의 Gemma 4 분석 동작 조건.** `ollama pull gemma4:26b` (~16GB VRAM) |
| GitHub PAT | 선택 | rate limit 완화 (anonymous 60req/h) |
| HF token | 선택 | rate limit 완화 |
| Reddit Client ID/Secret | 선택 | 없으면 Reddit 크롤 skip |
| NAS 네트워크 드라이브 | 선택 | Phase 3 영상 첨부용 (`M:\sota_files\`) |

`.env.example` 의 각 항목 주석에 발급 URL · skip 시 영향 다 적혀있음. 본인 필요한 만큼만 채우면 됨.

### 한 방 설치
```powershell
git clone https://github.com/jsdavid88-dsu/G30SotaHub_v2.git
cd G30SotaHub_v2

# 1회만 — 의존성·DB·시드 자동 셋업
.\setup.ps1

# 매번 — 백엔드/프론트/DB 기동 (3개 PowerShell 창 자동으로 띄움)
.\start.ps1
```

### 🔄 git pull 후 (이슈 #9 — 5090 PC 같은 운영 환경에서 매번 확인)
```powershell
git pull
.\start.ps1   # alembic head 자동 검증. mismatch 면 prompt 띄우고 upgrade.
```

`.\start.ps1` 가 alembic 버전 검증해서 신규 마이그레이션 펜딩이면 **백업 권고 + y/N 프롬프트** 띄움. **destructive migration 가능성 있는 (예: Phase 1 통합) 경우 PG 백업 강력 권장**:
```powershell
# native Postgres (5090 PC 등)
pg_dump -U hub -h localhost hub > backup_before_migrate.sql

# (참고) docker compose 환경이면
# docker compose exec db pg_dump -U hub hub > backup_before_migrate.sql
```

수동 적용 원하면:
```powershell
cd backend
.\.venv\Scripts\activate
alembic current   # 현재 DB 버전
alembic heads     # 코드의 head 버전
alembic upgrade head
```

### 🩺 서버 상태 빠른 확인
```powershell
# schema_ok=false 이면 마이그레이션 펜딩 (Issue #9)
curl http://localhost:8011/api/health
```

접속:
- **Frontend** http://localhost:3030 — Hub 일상 협업 (대시보드, 데일리, 프로젝트, 캘린더, ...)
- **VFX SOTA**  http://localhost:3030/vfx — VFX 자동 수집 + 카테고리 + 계보 그래프 + 피드 + 제보
- **API 문서** http://localhost:8011/api/docs

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

같은 Postgres DB · 같은 FastAPI · 같은 Vite 앱 · 같은 포트(3030/8011). 두 인증은 일단 분리 (Phase 4 에서 통합).

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
- 전체: http://localhost:8011/api/docs

---

## 📋 작업별 사전 조건 (수집/분석)

VFX Dashboard 의 4개 admin 버튼 / 자동 스케줄러가 어떤 조건에서 동작하는지:

| 작업 | 트리거 | 시간 | 필요 조건 | Gemma 4 사용? |
|------|-------|------|----------|---------------|
| **빠른 수집** | 버튼 / 09:00 자동 | 1-2분 | (옵션) GitHub/HF/Reddit 토큰 — 없으면 해당 소스 skip | ❌ 키워드 매칭만 |
| **야간 배치** | 버튼 / 21:00 자동 | 5-30분 | **Ollama + gemma4:26b 필수** (없으면 분석 부분만 skip) | ✅ 핵심 분석 |
| **코드 링크** | 버튼 | 1분 | Semantic Scholar API (anonymous OK) | ❌ |
| **계보 빌드** | 버튼 | 2-5분 | Semantic Scholar API (anonymous OK) | ❌ |
| **피드 크롤** | 버튼 / 12:00·18:00 자동 | 1-2분 | 토큰 옵션 (Reddit 토큰 없으면 reddit skip) | ❌ |

### Gemma 4 동작 확인 (야간 배치 전)

```powershell
# 1. Ollama 설치되어 있나
ollama list

# 2. gemma4:26b 모델 받았나 (없으면)
ollama pull gemma4:26b

# 3. Ollama 서버 떠있나
curl http://localhost:11434/api/tags
# → {"models":[{"name":"gemma4:26b",...}]} 보이면 OK
```

`.env` 의 `OLLAMA_BASE_URL` 기본값 `http://localhost:11434` (단일 PC 운용).
별도 GPU PC 면 그 PC IP 로 변경 (예: `http://100.x.x.x:11434` Tailscale).

---

## 🤖 AI Cluster Worker (Gemma 4 분리 운용 시)

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
# config.yaml 편집: MAIN_PC_URL=http://<5090-ip>:8011
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

## 🔧 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| `[빠른 수집]` 눌러도 데이터 0 | `.env` 에 토큰 없음 → 대부분 소스 skip | GitHub/HF/Reddit 토큰 채움. 그래도 arxiv 는 항상 동작해야 함. 백엔드 콘솔 에러 확인 |
| `[야간 배치]` 가 Gemma 호출 실패 | Ollama 미설치 또는 미실행 | `ollama serve` + `ollama pull gemma4:26b` |
| `401 Invalid admin token` | 백엔드 옛 코드 | `git pull` + 백엔드 재시작 (run_server 창 Ctrl+C → 다시) |
| `Window: ProactorEventLoop ...` | uvicorn 직호출 | `python run_server.py --reload` 사용 (asyncio policy wrapper) |
| `ConnectionDoesNotExistError` | DB pool stale | 백엔드 재시작 (이미 pool_pre_ping 설정돼 있음) |
| `403` 모든 api | 사용자 status pending | DEBUG=true 면 자동 active. 아니면 admin 이 status 변경 |
| 첫 실행 시 alembic 실패 | VFX 마이그 SQLite→Postgres 호환 일부 미검증 | issue 등록 또는 Phase 1 정비 |
| 포트 3030 충돌 | 기존 Hub 이미 실행 중 | 그 프로세스 종료 후 `start.ps1` |

---

## 🪪 라이선스

Internal — Red Cat Gang / Dongseo University · 모터헤드 협업
