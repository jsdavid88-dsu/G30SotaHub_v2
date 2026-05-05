# AI Cluster Worker

**이 컴포넌트는 AI Cluster PC (RTX 4090)에서 실행합니다.** 메인 PC의 VFX SOTA Monitor에 연결하여, 수집된 아이템을 Gemma 4 26B로 스코어링한 뒤 결과를 돌려보냅니다.

## 요구사항

- Python 3.12+
- [Ollama](https://ollama.com) + `gemma4:26b` 모델
- 메인 PC로 네트워크 접근 (Tailscale 권장)

## 설치

```powershell
# 1. Ollama 모델 다운로드 (18GB, 최초 1회)
ollama pull gemma4:26b

# 2. Python 환경
cd ai_cluster_worker
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

# 3. config 복사 및 편집
copy config.example.yaml config.yaml
# config.yaml 편집:
#   MAIN_PC_URL: http://100.x.x.x:8001  (메인 PC Tailscale IP)
#   ADMIN_TOKEN: 메인 PC의 .env와 동일하게
```

## 실행

### 단발 실행 (수동)
```powershell
python worker.py --once
```

### 지속 실행 (폴링 모드)
```powershell
python worker.py --interval 300   # 5분마다 체크
```

### Windows Task Scheduler로 자동 실행
매일 아침 10시에 자동으로 미스코어 아이템 처리:
1. Task Scheduler 열기
2. Create Basic Task → Trigger: Daily 10:00 AM
3. Action: `python G:\...\ai_cluster_worker\worker.py --once`

## 동작 흐름

1. 메인 PC에 `GET /api/admin/pending-scoring` 요청
2. `llm_score = 0`인 아이템 목록 받음 (최대 50개)
3. 각 아이템을 Gemma 4에게 프롬프트로 전달
4. 관련성 점수 (1-10), 우선순위 (P0-P3), 근거 추출
5. `POST /api/admin/score-update`로 결과 일괄 전송

## 구조

```
ai_cluster_worker/
├── README.md
├── requirements.txt        # openai, httpx, pyyaml
├── config.example.yaml
├── config.yaml             # (gitignored)
├── worker.py               # 메인 워커
└── prompts.py              # Gemma 프롬프트 템플릿
```

## Phase 3에서 완성 예정

현재 이 폴더는 **스텁**입니다. Phase 3에서 실제 구현됩니다.
