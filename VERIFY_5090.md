# 🧪 5090 검증 가이드 (이번 세션 푸시분)

> **읽는 너(5090 Claude)에게**: 아래 항목을 순서대로 실행하고, 각 "실패 시" 칸대로 이슈에 코멘트/생성해줘.
> 통과한 항목은 해당 이슈에 "✅ 검증 통과" 코멘트 → close 후보로 표시.
> 기준 커밋: **HEAD `64daae5`** (origin/master). dev(나)는 Ollama/Postgres 없어 런타임 미검증 — 그래서 너가 필요.

---

## 0. 준비 (git pull 후 1회)
```powershell
git pull                              # 64daae5
cd backend; .\.venv\Scripts\activate
alembic upgrade head                  # ★ j0a1·k0a1·l0a1·m0a1(raw 테이블) — 안 하면 raw/Lint 500
$env:OLLAMA_FLASH_ATTENTION="1"; $env:OLLAMA_KV_CACHE_TYPE="q8_0"   # 영구 적용은 시스템 환경변수로
#  .env: REDDIT_CLIENT_ID/SECRET, GITHUB_TOKEN, (LDR 할 거면) LDR_USERNAME/PASSWORD
python seed_vfx.py                    # 필요 시
npm --prefix ..\frontend ci           # lockfile
.\diagnose.ps1 --full                 # 풀 night_batch — 아래 1~6 로그가 여기서 나옴
```

---

## ⚡ 전력 안정화 (night_batch 다운 방지) — **우선 적용**
**증상**: GPU 스트레스 테스트는 통과하는데 night 풀배치 ~1/4 다운.
**원인**: 정상 용량 문제 아님. ① **트랜션트 스파이크**(LLM 배치가 부하를 확확 on/off → 순간 피크가 PSU OCP 트립) ② **CPU+GPU 동시 피크**(배치는 크롤/브라우저/DB + GPU 동시 → 순수 GPU 스트레스보다 시스템 총전력↑). 1/4 간헐 = 트랜션트 트립 전형.

**적용 (CLI — 스크립트/부팅 자동화 가능, 위→아래):**
1. `nvidia-smi -pl 350`  — 피크 캡 (여전히 다운이면 320 → 300)
2. `nvidia-smi -lgc 0,2400`  — GPU 클럭 상한 캡 → **트랜션트 진폭↓** (부팅마다 재적용)
3. `$env:OLLAMA_NUM_PARALLEL="1"` + `$env:OLLAMA_MAX_LOADED_MODELS="1"`  — GPU 요청·모델 스태킹 방지
4. (그래도 다운 시) **언더볼팅** (Afterburner 커브, 예 0.9V@~2600MHz) — 성능 거의 유지하며 트랜션트 최대 감소. 이 증상엔 사실상 최종병기.

**금지**: gemma + Qwen(또는 2모델) **동시 상주 X** — 동시 피크 = 다운 유발. LDR 등도 GPU 작업은 **순차**로.
**확인**: 위 적용 후 night_batch 3~4회 무다운이면 성공. 그래도 다운 → PSU 트랜션트 헤드룸(HW) → 언더볼팅 강하게 / PSU 점검. (이 항목은 #21에 결과 코멘트)

---

## 검증 항목

### 1. alembic / 부팅 (배포 #9)
- **기대**: `alembic upgrade head` 성공, 앱 부팅 OK, Dashboard 200.
- **실패 시 → #9 코멘트**: 실패한 revision + 에러 로그. (raw/Lint/Dashboard 500이면 보통 migration 미적용)

### 2. #6 — score & feed_filter 폴백
- **로그 확인**: `Scoring 폴백: N/N 복구` / `Feed filter 폴백: N/N 복구`. `diagnose.ps1` 섹션3 `unscored`.
- **기대**: **unscored 0**, `Feed filter: failed to parse` **플러드 사라짐**, 실제 `_irrelevant` 태깅 일부 생김(필터가 살아있음).
- **실패 시 → #6 코멘트**: unscored 수치 + `failed to parse` 잔존 횟수 + 로그 발췌. (0이면 "✅ feed_filter까지 검증, close 가능")

### 3. 🔴 native think 토글 (gemma4 thinking 버그 — #6 근본)
- **로그 확인**: `Gemma native: think=False ... content_len>0` 가 뜨는가? `Gemma native 실패(OpenAI 폴백)` 가 **안** 떠야 정상.
- **속도**: score 배치 처리시간이 이전보다 눈에 띄게 빠른가(목표 ~5x).
- **기대**: native 경로로 think=False 가 실제 동작(content>0) + 빨라짐.
- **실패 시 → 새 이슈** `[perf] gemma4 native /api/chat think 토글 미동작`: 본문에 `Gemma native ...` 로그(실패 사유/`content_len`), Ollama 버전(`ollama --version`), 폴백으로 빠졌는지. (폴백되면 기능은 정상이나 5x 못 얻음 — 회귀는 아님)

### 4. 온톨로지 raw tier (신규)
- **로그**: `[raw] snapshots created=N/...`. **API**: `GET /api/v1/vfx/ontology/items/{id}/raw` (로그인 유저).
- **기대**: `model_raw_snapshots` 에 row 생성, API 가 스냅샷 이력 반환.
- **실패 시 → 새 이슈** `[ontology] raw 스냅샷 미생성`: created 수치 + 에러 로그 + (테이블 없으면 alembic m0a1 확인).

### 5. 온톨로지 Lint (신규)
- **로그**: night_batch 끝 `[lint] stale=.. orphan=.. dangling=.. contradiction=.. dup=..`. **API**: `POST /api/v1/vfx/ontology/lint` (admin/professor).
- **기대**: Lint 리포트 JSON 반환, stale 자동 태깅(오래된 unverified→stale) 동작.
- **실패 시 → 새 이슈** `[ontology] Lint 실패`: 에러 로그 + API 응답.

### 6. #7 — 크롤 소스
- **로그**: `[feed_reddit] r/{sub}: N posts`(PRAW, .env 키 필요) / `[arca] /b/{slug}: N`(재확인) / hf_trending·youtube.
- **기대**: reddit `.env` 키 넣으면 N>0. arca/hf/youtube 유지.
- **실패 시 → #7 코멘트**: 소스별 N + 로그. reddit 키 없으면 "키 미입력"으로 명시(코드 아님).

### 7. LDR 1사이클 (LDR_SETUP.md, 선택)
- **실행**: `python run_deep_research.py "latest text-to-video diffusion 2026"`.
- **기대**: `findings=N (N>0)` → `ingested_new` → `scored`. (어댑터는 6f95337에서 sources[] 파싱으로 이미 고침)
- **실패 시 → #11 코멘트**: 콘솔 리포트 + `backend/data/ldr_last_result.json` 구조 첨부.

### 8. GPU / 전력 (#21)
- **기대**: 풀배치(크롤+score+wiki+raw+lint) `nvidia-smi -pl 400` 캡에서 **크래시 0** 완주.
- **실패 시 → #21 코멘트**: peak W + 크래시 시점/단계.

---

## 이슈 작성 규칙
- **기존 이슈 우선**: #6(score/filter), #7(크롤), #9(배포/migration), #11(LDR), #21(GPU/전력) → 해당하면 거기 **코멘트**.
- **새 현상만 새 이슈**: 제목 `[영역] 한 줄`. 본문 = ① 재현 명령 ② 기대 vs 실제 ③ **로그 발췌**(특히 `content_len`/에러 타입) ④ 기준 커밋(HEAD).
- **통과**: 해당 이슈에 "✅ 검증 통과 (HEAD 64daae5)" + 수치 → close 후보로 표시 (close 는 David 확인 후).

## 한 줄 우선순위
**2(#6) → 3(native think) → 4·5(raw/Lint) → 6(#7 reddit) → 7(LDR) → 8(GPU).** 2·3 이 제일 중요(자율 파이프라인 핵심).
