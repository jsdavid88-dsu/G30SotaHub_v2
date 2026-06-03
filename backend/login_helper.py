"""스크래퍼 전용 브라우저 프로필 로그인 도우미 (5090에서 1회 실행).

흐름:
  1) 5090에서 `python login_helper.py` 실행
  2) 브라우저 창이 뜨면 각 탭에서 로그인 (Reddit / 아카라이브 / X 는 버너 계정)
  3) 콘솔에서 Enter → 쿠키/세션이 전용 프로필(user_data_dir)에 저장됨
  4) 이후 크롤러(crawl4ai_src)가 같은 프로필을 headless 로 재사용 → 로그인 상태로 긁음

주의:
  - 이 스크립트는 Playwright 기본 이벤트루프(Windows=Proactor)를 쓴다. 앱(run_server.py)은
    psycopg 때문에 SelectorEventLoop 를 쓰므로 **앱과 분리된 독립 실행 전용**이다.
  - 처음 실행 시 "chromium 없음" 에러가 나면: `python -m playwright install chromium`
  - 생성되는 프로필 폴더(scraper_profile/)에는 로그인 쿠키가 들어가므로 **절대 커밋 금지**
    (.gitignore 에 등록됨).
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# 전용 프로필 경로 — feed_x.py 의 PROFILE_DIR 과 **동일**해야 함
# (backend/data/x_browser_profile). 한 프로필에 X·Reddit·아카 모두 로그인 → 모든
# 브라우저 기반 소스가 공용. 이미 .gitignore 등록됨(쿠키 포함 → 커밋 금지).
# 인자로 경로를 주면 그걸 우선 사용.
DEFAULT_PROFILE_DIR = str(Path(__file__).resolve().parent / "data" / "x_browser_profile")

# 로그인할 사이트 (탭으로 한 번에 염)
# Reddit 은 PRAW(.env REDDIT_CLIENT_ID/SECRET) 사용 → 브라우저 로그인 불필요(제외).
SITES = [
    ("아카라이브", "https://arca.live"),
    ("X (버너 계정)", "https://x.com/login"),
]


async def main(profile_dir: str) -> None:
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("[login] playwright 미설치 — `pip install playwright && python -m playwright install chromium`")
        sys.exit(1)

    Path(profile_dir).mkdir(parents=True, exist_ok=True)
    print(f"[login] 전용 프로필 경로: {profile_dir}")
    print("[login] 브라우저 창을 엽니다. 각 탭에서 로그인하세요 (X 는 반드시 버너 계정).")

    async with async_playwright() as p:
        # 5090 실측(#7): 번들 chromium 은 Cloudflare(arca)/X 봇탐지로 로그인 실패.
        # 시스템 Chrome(channel="chrome")으로 띄우면 Cloudflare Turnstile 통과. Chrome 없으면 번들 폴백.
        _common = dict(
            headless=False,
            args=["--disable-blink-features=AutomationControlled"],
            ignore_default_args=["--enable-automation"],
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
        )
        try:
            ctx = await p.chromium.launch_persistent_context(profile_dir, channel="chrome", **_common)
            print("[login] 시스템 Chrome(channel=chrome) 사용 — Cloudflare 통과율 높음")
        except Exception as e_chrome:
            print(f"[login] Chrome 실행 실패({e_chrome}) — 번들 chromium 폴백 (Cloudflare 막힐 수 있음)")
            try:
                ctx = await p.chromium.launch_persistent_context(profile_dir, **_common)
            except Exception as e:
                print(f"[login] 브라우저 실행 실패: {e}")
                print("[login] chromium 미설치면: python -m playwright install chromium")
                sys.exit(1)

        for name, url in SITES:
            page = await ctx.new_page()
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=60000)
                print(f"  - {name}: 열림 ({url})")
            except Exception as e:
                print(f"  - {name}: 자동 열기 실패({e}) — 주소창에 직접 입력하세요: {url}")

        print()
        input(">> 3개 사이트 전부 로그인했으면 여기서 Enter (창은 자동으로 닫힙니다)...")
        await ctx.close()

    print("[login] 세션 저장 완료. 이제 크롤러가 이 프로필을 재사용합니다.")


if __name__ == "__main__":
    profile = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PROFILE_DIR
    asyncio.run(main(profile))
