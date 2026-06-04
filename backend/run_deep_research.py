"""LDR → Arca → DB 한 사이클 (5090 에서 실행).

  python run_deep_research.py "latest text-to-video diffusion models 2026"

흐름:
  1) LDR(local-deep-research) 로 agentic 리서치  ← 발견 (별도 설치 필요)
  2) 결과 raw 를 data/ldr_last_result.json 에 덤프 (출력 구조 확인용)
  3) 소스 URL(arxiv/github/hf) 추출 → Item 적재(llm_score=0)
  4) Arca(gemma4) step_score_items 로 정리 ← 우리 두뇌
  5) 리포트 출력

전제(5090, 1회 셋업): LDR_SETUP.md 참조.
  - pip install local-deep-research + Ollama 설정 + LDR 계정 생성
  - .env 에 LDR_USERNAME / LDR_PASSWORD

주의:
  - LDR 출력 구조는 미문서화 → 어댑터가 URL 정규식으로 방어적 추출. raw 덤프 보고 조정.
  - LDR 은 기본 이벤트루프로 먼저 실행, 그 다음 우리 DB 작업만 win32 SelectorEventLoop.
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"
DUMP_PATH = DATA_DIR / "ldr_last_result.json"

DEFAULT_QUERY = "latest state-of-the-art text-to-video and image-to-video diffusion models 2026"


def _run_ldr(query: str):
    """LDR 호출 (sync). 실패 시 (None, error_msg)."""
    from app.config import settings

    user = settings.ldr_username
    pw = settings.ldr_password
    if not user or not pw:
        return None, "LDR_USERNAME/LDR_PASSWORD 가 .env 에 없음 (LDR_SETUP.md 참조)"

    try:
        from local_deep_research.api import quick_summary
        from local_deep_research.settings import SettingsManager
        from local_deep_research.database.session_context import get_user_db_session
    except ImportError as e:
        return None, f"local-deep-research 미설치: {e} → pip install local-deep-research"

    try:
        with get_user_db_session(username=user, password=pw) as session:
            settings_snapshot = SettingsManager(session).get_all_settings()
        result = quick_summary(
            query=query,
            settings_snapshot=settings_snapshot,
            iterations=settings.ldr_iterations,
            questions_per_iteration=settings.ldr_questions_per_iteration,
        )
        return result, None
    except Exception as e:  # noqa: BLE001 — LDR 내부 예외 종류 다양
        return None, f"LDR 실행 실패: {type(e).__name__}: {e}"


async def _ingest_and_score(result, query: str) -> dict:
    from app.jobs.deep_research import extract_findings_from_ldr, ingest_findings
    from app.jobs.night_batch import step_score_items

    findings = extract_findings_from_ldr(result, query=query)
    ingest = await ingest_findings(findings)
    print(f"  - findings={ingest['candidates']} → ingested_new={ingest['ingested_new']}")

    print("  - Arca(gemma4) 정리 중 (step_score_items)...")
    score = await step_score_items()
    print(f"  - scored={score.get('scored', 0)}/{score.get('total', 0)}")
    return {"ingest": ingest, "score": score, "findings": len(findings)}


def main() -> None:
    query = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_QUERY
    print(f"== LDR → Arca → DB 한 사이클 ==\nquery: {query!r}\n")

    # 1) LDR (기본 이벤트루프)
    print("[1/3] LDR 리서치 중...")
    result, err = _run_ldr(query)
    if err:
        print(f"  ✗ {err}")
        sys.exit(1)

    # 2) raw 덤프 (출력 구조 확인용 — 첫 사이클의 핵심 산출물)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    try:
        DUMP_PATH.write_text(json.dumps(result, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
        print(f"  - raw 덤프: {DUMP_PATH}")
    except Exception as e:
        print(f"  - raw 덤프 실패(무시): {e}")
    if isinstance(result, dict):
        print(f"  - result keys: {list(result.keys())}")

    # 3) 우리 DB 작업은 win32 SelectorEventLoop (psycopg async)
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    print("[2/3] 소스 추출 + Item 적재...")
    print("[3/3] Arca 정리...")
    stats = asyncio.run(_ingest_and_score(result, query))

    print(
        f"\n== 사이클 완료 ==\n"
        f"findings={stats['findings']}, ingested_new={stats['ingest']['ingested_new']}, "
        f"scored={stats['score'].get('scored', 0)}\n"
        f"(소스 추출 0건이면 {DUMP_PATH} 의 구조 보고 deep_research.extract_findings_from_ldr 조정)"
    )


if __name__ == "__main__":
    main()
