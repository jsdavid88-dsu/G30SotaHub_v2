"""In-memory 진행 상태 — 야간 배치 / 크롤러 / 분석 작업이 지금 뭐 하고 있는지 가시화.

Frontend RunStatusBar 가 GET /admin/run-status 폴링해서 표시.

설계:
- 단일 process 가정 (uvicorn workers=1, run_server.py). multi-worker 면 worker별 다른 상태.
- Lock 으로 thread-safe (BackgroundTasks 동시 실행 가능성 대응).
- 백엔드 재시작 시 state 사라짐 — 진행 중이던 작업도 어차피 죽음.
"""
from datetime import datetime
from threading import Lock
from typing import Any

_lock = Lock()
_current: dict[str, Any] = {
    "is_running": False,
    "action": None,        # "night_batch", "crawl_all", "crawl:arxiv" 등
    "label": None,         # 사용자 친화 라벨 ("야간 배치 (Gemma 분석)")
    "stage": None,         # 현재 단계 설명
    "detail": None,        # 부가 정보 (예: "5/28 scored")
    "progress": None,      # 0.0~1.0 또는 None
    "started_at": None,
    "finished_at": None,
    "result": None,        # 끝났을 때 요약
    "error": None,         # 실패 시 메시지
}


def begin(action: str, label: str | None = None, stage: str | None = None) -> None:
    """작업 시작. is_running=True 로 전환."""
    with _lock:
        _current.update({
            "is_running": True,
            "action": action,
            "label": label or action,
            "stage": stage or "시작 중...",
            "detail": None,
            "progress": None,
            "started_at": datetime.utcnow().isoformat() + "Z",
            "finished_at": None,
            "result": None,
            "error": None,
        })


def update(
    stage: str | None = None,
    detail: str | None = None,
    progress: float | None = None,
) -> None:
    """진행 상태 갱신. 빈 인자는 무시."""
    with _lock:
        if stage is not None:
            _current["stage"] = stage
        if detail is not None:
            _current["detail"] = detail
        if progress is not None:
            _current["progress"] = max(0.0, min(1.0, progress))


def end(result: dict | None = None, error: str | None = None) -> None:
    """작업 종료. is_running=False. result/error 둘 중 하나 채우기."""
    with _lock:
        _current.update({
            "is_running": False,
            "stage": "완료" if not error else "실패",
            "finished_at": datetime.utcnow().isoformat() + "Z",
            "result": result,
            "error": error,
        })


def snapshot() -> dict[str, Any]:
    """현재 상태 사본 반환 (lock 안에서 읽기 전용)."""
    with _lock:
        return dict(_current)
