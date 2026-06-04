# LDR (Local Deep Research) 통합 — 5090 셋업 + 1 사이클

**목표**: LDR(agentic 발견) → Arca/gemma4(정리) → 우리 DB. 한 사이클을 5090 에서 돌린다.

> 분담: LDR 이 "스스로 검색어 만들고 반복 탐색"(우리 키워드 크롤이 못하는 것),
> Arca 는 그 결과를 우리가 잘하는 방식으로 점수·분류·위키. LDR 출력 구조가 미문서화라
> **첫 사이클의 핵심 산출물은 `backend/data/ldr_last_result.json` (raw 덤프)** — 이걸 보고 어댑터 확정.

## 1) LDR 설치 (5090, 1회)
```powershell
cd backend
.\.venv\Scripts\activate
pip install local-deep-research
```

## 2) LDR 계정 + 설정 (1회)
LDR 은 자체 user DB 가 있어 계정이 필요하다 (settings_snapshot 조회용).
- LDR 웹 UI 또는 CLI 로 사용자 1개 생성 (username/password).
- LDR 설정에서:
  - **LLM provider = Ollama** (`http://localhost:11434`), model = `gemma4:26b` (품질 부족하면 `qwen3.6:27b` 등으로 교체 — LDR 권장)
  - **검색 엔진**: `arxiv`, `github` 활성화 (웹/SearXNG 는 별도 인스턴스 필요하니 처음엔 제외)
  - iterations 2, questions_per_iteration 3 정도 (느리면 줄이기)

## 3) 자격증명 → 우리 .env
```
LDR_USERNAME=<위에서 만든 계정>
LDR_PASSWORD=<비번>
# (선택) LDR_ITERATIONS=2  LDR_QUESTIONS_PER_ITERATION=3
```

## 4) 한 사이클 실행
```powershell
cd backend
python run_deep_research.py "latest text-to-video diffusion models 2026"
```
하는 일: LDR 리서치 → `data/ldr_last_result.json` 덤프 → 소스(arxiv/github/hf) 추출
→ **공식 메타 enrich**(arxiv 초록 / github description·stars / hf 카드 — Arca 입력 품질↑)
→ Item 적재 → Arca(gemma4) `step_score_items` 로 재분석·정리 → 리포트.

## 5) 결과 공유 (dev 가 어댑터 확정)
- 콘솔의 `result keys:` + `findings=N`
- **`backend/data/ldr_last_result.json`** (출력 구조)
- → 소스 추출이 0건/적으면 이 덤프 구조 보고 `app/jobs/deep_research.py` 의
  `extract_findings_from_ldr` 를 LDR 실제 키에 맞게 조정 (지금은 URL 정규식 방어적 추출).

## 동작 메모
- GPU: LDR 탐색과 night_batch(Arca) 는 둘 다 5090 무거움 → **동시 실행 금지**(#21). 이 스크립트는 LDR 끝나고 Arca 순차.
- 비용: 전부 로컬(Ollama) = API $0.
- 중복: LDR 이 이미 가진 모델 찾아와도 `(source, external_id)` upsert(do-nothing)로 자동 머지 — 기존 풍부한 데이터 안 덮음.
- 적재 item 은 `item_metadata.discovered_via="ldr"` 태그 → 출처 추적.
