# G30SotaHub v2 — R&D Knowledge Graph Platform

> **"리서치 → 배치 → 테스트 → 보고 → 라이프사이클" 이 하나의 지식 그래프 안에서 유기적으로 도는 R&D 협업 플랫폼**

연구실(동서대 Red Cat Gang) + 외부 협업사(모터헤드 등) 가 한 공간에서 SOTA 모델을 자동 발견·테스트·보고·폐기하는 통합 플랫폼.

---

## 정체성

**구성:**
- `glocal30Hub` 베이스 — 연구실 일상 협업 인프라 (auth/RBAC, daily/weekly notes, projects, tasks, attendance, announcements, feed, push, google calendar)
- `vfx-sota-monitor` 흡수 — SOTA 자동 수집·점수화·계보 + Arca AI 에이전트
- **Karpathy LLM Wiki 온톨로지** — raw / wiki / outputs 3-tier, Ingest / Query / Lint 3 ops
- **노드그래프 시각화** — reactflow 기반, 분야 자유 추가/이동/병합

**핵심 기능 (Phase 별 진행):**
- 자동 SOTA 수집 (arXiv / GitHub / HuggingFace / Reddit / X / Papers With Code)
- 모델 카드 — GitHub·HF·논문·계보·담당자·영상 첨부·댓글 통합 표시
- 라이프사이클 관리 — research → dev → testing → production → deprecated, 신모델 → 구모델 폐기 추천
- 모터헤드 등 외부 협업사를 `external` 역할로 가입, 같은 프로젝트 내 모델 공유
- NAS 기반 영상 첨부 (백엔드 프록시 스트리밍)
- Arca 주간 리포트 — 자동 초안 → 본인+관리자 검토 → 발행

---

## 상태

**현재**: Phase 0 부트스트랩 완료 (2026-05-01) · Phase 1 진입 직전
**총 일정**: 약 4주 (6 phases)

| Phase | 내용 | 상태 |
|-------|------|------|
| 0 | 부트스트랩 (이 폴더 생성, 정체성 확립) | ✅ 완료 |
| 1 | DB 스키마 마이그레이션 (3-4일) | ⏭ 다음 |
| 2 | VFX 백엔드 흡수 (4-5일) | — |
| 3 | 그래프 UI (5-6일) | — |
| 4 | 모터헤드 협업 UX (3-4일) | — |
| 5 | Arca 주간 리포트 (4-6일) | — |
| 6 | 정리 & vfx-sota-monitor 폐기 (2-3일) | — |

---

## 문서

- **마스터 설계서**: [docs/superpowers/plans/2026-04-30-vfx-integration-knowledge-graph.md](docs/superpowers/plans/2026-04-30-vfx-integration-knowledge-graph.md) — 14장, 비전·아키텍처·온톨로지·스키마·권한·Arca 리포트·Phase 분할
- **Phase 1 체크리스트**: [PLAN.md](PLAN.md)
- **AI 에이전트 진입점**: [CLAUDE.md](CLAUDE.md)
- **선행 분석**: `Z:\Antigravity_prj\Vault\00_Master\_log.md` (2026-04-30 통합 결정)

---

## 원본 보존 위치

본 폴더는 두 원본을 흡수하여 만든 새 정체성. 원본은 참조용으로 변경 없이 보존:

- `Z:\Antigravity_prj\glocal30Hub\` — Hub 원본 (이 폴더의 베이스)
- `Z:\Antigravity_prj\vfx-sota-monitor\` — VFX 원본 (Phase 1-2 에서 점진적 흡수)

> **이 폴더가 진본**. glocal30Hub / vfx-sota-monitor 는 변경하지 말 것 (역사적 참조).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI 0.115 + SQLAlchemy 2.0 (async) + PostgreSQL 16 |
| Frontend | React 19 + TypeScript 5.9 + Vite 7 + Tailwind 4 |
| Graph UI | reactflow 11 |
| Auth | Google OAuth (Authlib) + JWT |
| Migration | Alembic |
| Crawler | crawl4ai, praw, BeautifulSoup, httpx |
| LLM (Arca) | Ollama + Gemma 4 26B (5090 GPU 직접) |
| Scheduler | APScheduler (09:00 정기 / 21:00 야간 / 일 22:00 주간 리포트) |
| Storage | NAS 네트워크 드라이브 (영상), Postgres (메타데이터) |
| Deploy | 단일 5090 PC + Cloudflare Tunnel |

---

## 개발 환경 (Phase 1 진입 후)

```powershell
# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
# .env 작성 (DATABASE_URL, GOOGLE_CLIENT_ID/SECRET, SECRET_KEY 등)
alembic upgrade head
python seed.py
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

상세 환경변수 / Google OAuth 설정 / NAS 마운트 / Cloudflare Tunnel 설정 → Phase 1 이후 [CLAUDE.md](CLAUDE.md) 갱신 시 추가.

---

## 라이선스

Internal — Red Cat Gang / Dongseo University · 모터헤드 협업
