"""Backend entry-point — Windows-safe asyncio policy first, then uvicorn.

Issue #1: Windows의 default WindowsProactorEventLoopPolicy 가 asyncpg / psycopg
async 모드와 비호환. uvicorn 이 main 모듈을 import 하기 전에 policy 를 미리
설정해야 함 — 그래서 별도 wrapper 가 필요.

사용:
    python run_server.py            # production-ish (no reload)
    python run_server.py --reload   # 개발용 hot reload

mac/linux 는 sys.platform 가드 안에서 noop.
"""
import asyncio
import os
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import uvicorn  # noqa: E402  (intentionally imported after policy is set)


def main() -> None:
    reload = "--reload" in sys.argv or os.getenv("UVICORN_RELOAD") == "1"
    host = os.getenv("UVICORN_HOST", "0.0.0.0")
    port = int(os.getenv("UVICORN_PORT", "8000"))

    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        loop="asyncio",
        reload=reload,
    )


if __name__ == "__main__":
    main()
