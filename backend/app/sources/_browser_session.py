"""브라우저 기반 feed 소스 공용 유틸 (feed_x / feed_arca 등이 공유).

핵심 2가지:
1) PROFILE_DIR — login_helper.py 가 만든 로그인 세션(X·Reddit·아카 공용).
   브라우저 소스는 이 프로필을 headless 로 재사용 → Cloudflare/로그인 통과.
2) run_browser_coro() — Playwright 코루틴을 Windows 호환(Proactor) 이벤트루프에서 실행.

   왜 필요한가: 앱(run_server.py)은 psycopg async 때문에 전역 SelectorEventLoop 를 쓴다.
   그런데 Playwright 는 브라우저를 subprocess 로 띄우므로 Windows 에서는 ProactorEventLoop
   가 필수 (SelectorEventLoop 는 subprocess 미지원 → NotImplementedError). 따라서 브라우저
   소스는 **전용 스레드 + 자체 Proactor 루프**에서 돌려 전역 정책과 격리한다.
   (이 격리가 없으면 night_batch 안에서 X/아카 크롤이 Windows 5090 에서 터진다.)
"""
from __future__ import annotations

import asyncio
import concurrent.futures
import sys
from pathlib import Path
from typing import Any, Awaitable, Callable

# feed_x.py 의 PROFILE_DIR 과 동일 경로 — backend/data/x_browser_profile (이미 .gitignore).
PROFILE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "x_browser_profile"

# launch_persistent_context 공용 anti-detection 설정
LAUNCH_ARGS = ["--disable-blink-features=AutomationControlled"]
IGNORE_DEFAULT_ARGS = ["--enable-automation"]
DEFAULT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "Chrome/131.0.0.0 Safari/537.36"
)


def run_browser_coro(coro_factory: Callable[[], Awaitable[Any]]) -> Any:
    """Playwright 코루틴을 전용 스레드 + Windows 호환(Proactor) 루프에서 실행 후 결과 반환."""
    def _worker() -> Any:
        if sys.platform == "win32":
            loop = asyncio.ProactorEventLoop()
        else:
            loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(coro_factory())
        finally:
            loop.close()

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(_worker).result()
