# SETUP_5090.md — 5090 PC 운영 환경 셋업

> **이 문서는 5090 PC 에서 운영하는 클로드가 읽고 환경 셋업하는 진입점.**
> 한 번 셋업하면 끝. 이후엔 `git pull` + `.\start.ps1` 만.

---

## 환경 요약

| 항목 | 값 | 비고 |
|------|-----|------|
| OS | Windows 11 | PowerShell 5.1 기준 (PS 7+ 도 호환) |
| PostgreSQL | native 설치 (Docker 안 씀) | localhost:5432, user=hub, pass=hub, db=hub |
| Python | 3.12+ | `python --version` |
| Node | 22+ | `node --version` |
| Backend 포트 | 8011 | `start.ps1` 기본값 |
| Frontend 포트 | 3030 | `start.ps1` 기본값 |
| 외부 노출 | Tailscale funnel | `https://david-gv5.taildbc2cf.ts.net` |

---

## 1. 사전 설치 (1회만)

### 필수
- [x] Windows PostgreSQL 16 — service 자동 시작
- [x] Python 3.12+
- [x] Node 22+

### 권장 (Phase 2.5 미디어 + annotation 위해 필수)

**ffmpeg 설치:**
```powershell
winget install ffmpeg
```
또는 [ffmpeg.org](https://www.ffmpeg.org/download.html) 에서 다운 → PATH 추가.

검증:
```powershell
ffmpeg -version
ffprobe -version
```
**ffmpeg 없으면:**
- 영상 thumbnail/duration/fps 추출 skip
- non-web-safe 영상(ProRes mov / mkv / avi / 일부 hevc) **트랜스코딩 skip → 브라우저 재생 안 될 수 있음**
- MP4(H.264)/WebM 등 web-safe 원본은 ffmpeg 없어도 정상 재생

ffmpeg 있으면: 업로드 시 non-web-safe 영상을 H.264 MP4 로 자동 변환(원본 보존·백그라운드) + 영상 주석 프레임 정밀 네비(fps) 활성화.

### 옵션 (이 단계 아직 안 함)
- **Ollama + gemma4:26b** — 야간 배치 Gemma 분석용. 없으면 야간 배치의 score/filter step 만 skip.
- **NAS 네트워크 드라이브 (`M:\sota_files\`)** — 영상이 GB 단위로 쌓이면 권장. 현재는 `./backend/uploads/` fallback.

---

## 2. 최초 셋업

```powershell
git clone https://github.com/jsdavid88-dsu/G30SotaHub_v2.git
cd G30SotaHub_v2
.\setup.ps1
```

`.\setup.ps1` 가 자동으로:
- `.env.example` → `.env` 복사 (편집 필요)
- backend `venv` 생성 + `pip install -r requirements.txt`
- `alembic upgrade head`
- `python seed.py` (시드 데이터)
- frontend `npm install`

---

## 3. `.env` 설정 (5090 PC 운영용)

`./` 의 `.env` 파일에 다음 키 확인/설정:

```bash
# 핵심
DATABASE_URL=postgresql+asyncpg://hub:hub@localhost:5432/hub

# Storage (Phase 2.5 미디어)
STORAGE_BASE_PATH=./backend/uploads/        # 지금. NAS 이전 시 M:\sota_files\

# 외부 토큰 (옵션 — 없으면 해당 source skip)
GITHUB_TOKEN=<your-PAT>
HF_TOKEN=<your-hf-token>
REDDIT_CLIENT_ID=<your-client-id>
REDDIT_CLIENT_SECRET=<your-secret>

# Google OAuth (옵션)
GOOGLE_CLIENT_ID=<...>
GOOGLE_CLIENT_SECRET=<...>

# 푸시 알림 (옵션)
VAPID_PUBLIC_KEY=<...>
VAPID_PRIVATE_KEY=<...>
```

---

## 4. 매일 사용 (git pull 후)

```powershell
cd Z:\Antigravity_prj\G30SotaHub_v2
git pull

.\start.ps1
```

`.\start.ps1` 가 자동으로:
1. PostgreSQL localhost:5432 응답 체크
2. **alembic schema 검증 — pending migration 있으면 y/N prompt 후 upgrade**
3. Backend (`python run_server.py --reload`) 새 창
4. Frontend (`npm run dev`) 새 창

---

## 5. 동작 검증 (한 번에)

```powershell
# 백엔드 health
curl http://localhost:8011/api/health

# Frontend
start http://localhost:3030

# 또는 외부 (Tailscale funnel)
start https://david-gv5.taildbc2cf.ts.net
```

테스트 계정 (`seed.py` 가 생성):
- admin → admin@test.com
- professor → professor@test.com
- student → student1@test.com
- external → external@company.com

**dev login** (`/login` 페이지): 역할 선택 + "Dev Sign In" — OAuth 없이 즉시 로그인.

---

## 6. NAS 이전 (영상 GB 단위로 쌓이면)

지금: `./backend/uploads/` 에 저장.
NAS 마운트 후:

```powershell
# 1. 파일 복사
robocopy backend\uploads M:\sota_files /E

# 2. .env 수정
# STORAGE_BASE_PATH=M:\sota_files\

# 3. 백엔드 재시작
.\start.ps1
```

**DB 변경 X.** Attachment 모델은 상대 경로 (`storage_relpath`) 만 저장. base path 는 env.

---

## 7. 알려진 이슈 (활성 GitHub issues)

- **#6** Gemma 파싱 실패 (max_tokens 부족) — `arca_brain.py` fix 적용됨. 아래 진단 도구로 확인.
- **#7** 크롤러 huggingface 만 동작 — 진단 로그 추가됨. 아래 진단 도구로 확인.

### 🔍 진단 도구 — `diagnose.py` (#6/#7 검증용)

5090 에서 한 줄 돌리고 **출력 전체를 복붙해서 공유**하면 진단 가능:

```powershell
cd backend; .\.venv\Scripts\activate

# (1) 현재 DB 상태 스냅샷 — 안전·빠름, 크롤/LLM 안 함
python diagnose.py
#   → 소스별 item 수(#7), 최근 crawl 이력, 스코어링 상태(#6), brand/family

# (2) 크롤 1회 실제 실행 + 소스별 결과 (#7 직접 재현)
python diagnose.py --crawl
#   → huggingface 외 0건/에러면 #7 재현. [arxiv] 등 진단 로그 같이 출력

# (3) Gemma 스코어링 1회 + usage 로그 (#6, Ollama 필요)
python diagnose.py --score
#   → scored<total 이면 #6. 'Gemma usage:' completion vs max_tokens 확인

# (4) 둘 다
python diagnose.py --crawl --score

# (5) 야간배치 전체 1회 — 운영과 100% 동일 (crawl+score+wiki+grouper+promotion). 시간 오래.
python diagnose.py --full
#   → #6/#7 을 실제 야간배치와 똑같은 조건으로 한 번에 재현/검증
```

`--crawl`/`--score` 는 내부 진단 로그(`Gemma usage:`, `[arxiv] No cs.*` 등)도 stdout 에 같이 찍힘.

---

## 8. 자주 쓰는 명령

```powershell
# 백엔드 콘솔 확인 (start.ps1 가 띄운 창)
# 또는 수동 실행:
cd backend; .\.venv\Scripts\activate; python run_server.py --reload

# 마이그레이션 수동
cd backend; .\.venv\Scripts\activate
alembic current     # 현재 DB rev
alembic heads       # 코드의 latest rev
alembic upgrade head

# seed 재실행 (주의: 데이터 다 날아감)
cd backend; .\.venv\Scripts\activate
python seed.py

# 백업
pg_dump -U hub -h localhost hub > backup_$(Get-Date -Format yyyyMMdd).sql
```

---

## 9. 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| `start.ps1` 파싱 에러 (`Unexpected token '??'`) | PS 5.1 호환 (이미 fix 됨, commit `931d270`) | `git pull` 받기 |
| 메인 페이지 500 (모든 vfx/items 깨짐) | Phase 1 통합 migration 미적용 | `alembic upgrade head` |
| 영상 업로드 후 썸네일 안 보임 | ffmpeg 미설치 | `winget install ffmpeg` |
| `503 push/vapid-key` | VAPID 키 미설정 (옵션) | `.env` 의 `VAPID_*` 채우거나 무시 (UI 영향 X) |
| Reddit 크롤 0건 | REDDIT_CLIENT_ID/SECRET 미설정 | `.env` 확인. 안 쓸 거면 그대로. |

---

## 10. 진행 중인 작업 — 최신 상태

`PLAN.md` 참조. 핵심:

- ✅ Phase 1 통합 (sota_items ↔ items)
- ✅ VFX UI (카드/표/Triage/ItemDetail/RunStatusBar)
- ✅ DailyWrite SOTA inline 메모
- ✅ Hub Dashboard ActiveResearchSection
- ✅ Phase 1A @mention + Phase 1B 활동 피드 + Phase 2 메시지 보드
- ✅ Phase 2.5 A — 미디어 첨부 + 뷰어 (이미지/영상, ffmpeg 필요)
- ⏭ Phase 2.5 B — 이미지 annotation
- ⏭ Phase 2.5 C — 영상 annotation
- ⏭ Phase 3 — 그래프 UI

---

## 컨택트 / 메모

이 문서는 **5090 운영 클로드의 진입점**. 갱신 사항 있으면 여기에 추가.
설계 큰 그림: `docs/superpowers/plans/2026-04-30-vfx-integration-knowledge-graph.md`.
