# 🧪 5090 검증 가이드 (이번 세션 푸시분)

> **읽는 너(5090 Claude)에게**: 아래 항목을 순서대로 실행하고, 각 "실패 시" 칸대로 이슈에 코멘트/생성해줘.
> 통과한 항목은 해당 이슈에 "✅ 검증 통과" 코멘트 → close 후보로 표시.
> 기준 커밋: **HEAD `64daae5`** (origin/master). dev(나)는 Ollama/Postgres 없어 런타임 미검증 — 그래서 너가 필요.

---

## 📦 2026-06-12 업데이트 — NAS 저장소 연결 (이번 pull 의 5090 액션)

> 직전 정주행(06-11, 5개 이슈 ✅ 코멘트) 잘 받았다 — 그 항목들은 재검증 불필요.
> 이번 업데이트는 **NAS 저장 1건** + 운영 잔여. 기준: HEAD `856edf1`.

**무엇이 바뀌었나**: `get_base_path()` 가 이제 `NAS_BASE_PATH` 를 **최우선**으로 읽음
(NAS → STORAGE_BASE_PATH → ./backend/uploads/). David 가 NAS 를 네트워크 드라이브로
연결해둠. DB 는 상대경로만 저장하므로 env 한 줄로 전환 끝. base 는 1회 캐시(NAS 왕복↓),
UNC resolve 실패 시 graceful.

**5090 액션 (순서대로):**
1. `.env` 에 추가 (forward-slash 권장 — dotenv 백슬래시 이스케이프 회피):
   ```
   NAS_BASE_PATH=//192.168.131.154/Gibeom/g30_hub_Data
   ```
2. 백엔드 재시작 → 부팅 로그에 storage 관련 에러 없는지 확인.
   (mkdir 실패 = NAS 미연결/권한 문제. 백엔드 실행 계정이 해당 공유에 **쓰기 권한** 있어야 함.
   서비스 계정이면 매핑드라이브(Z:) 는 안 보일 수 있으니 UNC 직접 사용 — 위 값이 그것.)
3. **업로드 1회 테스트**: 프로젝트 토론(또는 아무 첨부 지점)에서 이미지 1장 + 영상 1개 업로드 →
   - NAS 에 `\\192.168.131.154\Gibeom\g30_hub_Data\{owner_type}\2026\06\...` 파일 생성 확인
   - 웹에서 이미지 표시 / 영상 재생(Range 스트림) / 썸네일 정상 확인
   - 영상은 `.thumb.png`·(non-web-safe 면) `.web.mp4` 가 NAS 에 같이 생기는지
4. (선택) 기존 로컬 업로드 이전: `robocopy backend\uploads \\192.168.131.154\Gibeom\g30_hub_Data /E`
   — DB 는 상대경로라 그대로 동작. 이전 안 하면 기존 파일만 404, 신규는 NAS 에 정상 저장.
5. **실패 시 → 새 이슈** `[storage] NAS 저장 실패`: 부팅 로그 + 업로드 시 에러 + `whoami` (실행 계정) + NAS 접근 테스트(`Test-Path` 결과).

**운영 잔여 (이전 라운드에서 이월):**
- `.env` `REDDIT_CLIENT_ID/SECRET` — 넣으면 reddit/feed_reddit 0→N (#7 마지막 조각)
- `feed_queries.yaml` 의 `x_accounts`/`youtube_channels` 채우기 (원하면)
- #6 잔여 unscored 2건 — 다음 night_batch 후 수치 확인 (0 또는 유지면 #6 close 의견 코멘트)

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

---

## 📦 2026-06-12 업데이트 2차 — 배정 현황판 + 테스트 영상/프레임 노트

pull 후 **반드시 migration**: `cd backend && alembic upgrade head` (→ `n0a1b2c3d4e5`, attachmentownertype 에 'sota_assignment' 추가). 백엔드 재시작 + `npm run build`.

### A. 데일리 403 (3951a48)
- 교수/admin 계정으로 데일리 작성 → **201** (이전 403).

### B. 배정 현황판 (SOTA 페이지)
- admin/professor 로 `/sota` → 상단 토글 **[논문 목록 | 배정 현황]**.
- "배정 현황" = 학생별 그룹: 배정 논문/모델 + 상태 + 마감(지나면 빨강) + 리뷰 수. 행 클릭 → 상세 모달. "학생 상세 →" → MemberDetail.
- API: `GET /api/v1/sota/assignments?scope=all` (운영진 전용, 학생은 403).

### C. 배정에 테스트 영상 업로드 + 프레임별 노트
- 학생 계정 `/sota` → 내 배정 카드에 **"테스트 자료"** 섹션 → 이미지/영상 첨부 (owner_type=sota_assignment).
- 업로드한 영상 클릭 → 뷰어 → **"주석"** 켜면 프레임 ±1 스텝 + 특정 프레임에 핀/박스/자유선 + 코멘트(timecode 노트). 노트 클릭 → 해당 프레임으로 seek.
- 교수: 상세 모달 배정 행 + MemberDetail "SOTA 배정" 탭에서 같은 자료/노트 열람·업로드.
- 권한: 배정 본인 + admin/professor 만 (타 학생 403).
- NAS 연결돼 있으면(`NAS_BASE_PATH`) 업로드 파일이 NAS 에 저장되는지 경로 확인.
- **실패 시 → 새 이슈** `[sota-media] ...`: 단계(업로드/스트림/주석) + HTTP 코드 + 백엔드 로그. migration 안 돌렸으면 enum 에러 — `alembic upgrade head` 먼저.

---

## 📦 2026-06-13 업데이트 — 연구 사이클 + 통합 피드 + 알림

pull 후 **반드시**: `cd backend && alembic upgrade head` → 마이그레이션 4개 적용
(`n0a1` sota_assignment enum, `o0a1` daily_block.sota_item_id + ItemComment.kind,
`p0a1` notification 연구타입, `q0a1` created_at 동결 디폴트 교정). 백엔드 재시작 + `npm run build`.

### A. 모델별 연구 사이클
- 학생: DailyWrite 블록 툴바 **"모델 연결"**(육각형) → 내 배정 모델 선택 → 저장.
- 모델 페이지(`/vfx/item/{id}`) **"연구 기록"** 피드 = 연결된 데일리 + 리뷰 + 테스트자료.
- 교수/외부: 모델 페이지 댓글창 **"컨펌"**(녹색) + 댓글. 학생은 컨펌 버튼 없음.
- **실패 시 → 새 이슈** `[research-cycle] ...`: 단계 + HTTP + 로그.

### B. 통합 연구 피드 (`/vfx/research`, 사이드바 "연구 피드")
- 필터 [전체(운영진)|분야별|학생별]. 모델 라벨 클릭 → 모델 페이지.
- 데일리(모델연결)+리뷰+테스트영상이 시간순. 외부연구원은 본인 배정 모델 연구만.

### C. 데일리 블록 영상 + 프레임 노트
- 데일리 피드(`/daily/feed`)에서 날짜 선택 → 내 엔트리 펼치기 → 블록 **"영상/이미지"** 업로드.
- 영상 열고 "주석" → 프레임 ±1 + timecode 노트. (owner_type=daily_block)
- 이 영상도 연구 피드/모델 피드에 자동 합류.

### D. 알림 (사이클 자동화)
- 모델 컨펌/댓글 → 관련자(배정학생∪배정교수), 리뷰 제출 → 배정한 교수. 알림 벨/`/notifications`.
- **created_at 동결 버그 수정됨** — q0a1 안 돌리면 알림이 옛날 시각으로 박혀 정렬 깨짐.

### E. raw provenance
- 모델 페이지 **"원본 이력"**(접이식) = 그 모델이 어느 소스/언제 수집됐나 (raw tier).

### 검증 메모
dev 머신(portable PG16+venv+Playwright)에서 A~E 실스택 E2E 통과:
컨펌→학생 알림·리뷰→교수 알림 생성, created_at 실시각·최신순, 데일리영상 owner=daily_block 저장,
통합피드 전체/분야/학생 전환, 외부=본인배정모델만. alembic n0a1~q0a1 클린 통과.
