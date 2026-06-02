# X/Twitter feed — Playwright with saved login session.
# No API key, no fxtwitter. Direct browser scraping with persistent auth.
#
# Setup: run `python login_helper.py` once to save login session
#        (X·Reddit·아카 공용 프로필 — backend/data/x_browser_profile).
from __future__ import annotations

import asyncio
import hashlib
import logging
import re
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

PROFILE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "x_browser_profile"


async def _scrape_x_profile(url: str, max_tweets: int = 10) -> list[dict]:
    """Scrape tweets from an X profile page using saved session."""
    if not PROFILE_DIR.exists():
        logger.warning("X browser profile not found. Run scripts/x_login_setup.py first.")
        return []

    try:
        from playwright.async_api import async_playwright

        pw = await async_playwright().start()
        browser = await pw.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE_DIR),
            headless=True,
            args=["--disable-blink-features=AutomationControlled"],
            ignore_default_args=["--enable-automation"],
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
        )
        page = browser.pages[0] if browser.pages else await browser.new_page()

        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=20000)
        except Exception:
            pass
        await asyncio.sleep(5)

        # Scroll to load more tweets
        for _ in range(3):
            await page.evaluate("window.scrollBy(0, 2000)")
            await asyncio.sleep(2)

        # Extract tweet data from article elements
        tweets = await page.query_selector_all('article[data-testid="tweet"]')
        results = []

        for tw in tweets[:max_tweets]:
            try:
                # Text
                text_el = await tw.query_selector('div[data-testid="tweetText"]')
                text = await text_el.inner_text() if text_el else ""

                # Author
                author_el = await tw.query_selector('div[data-testid="User-Name"] a')
                author_href = await author_el.get_attribute("href") if author_el else ""
                handle = author_href.strip("/").split("/")[-1] if author_href else ""

                # Tweet link (for ID)
                time_el = await tw.query_selector("time")
                time_parent = await time_el.evaluate_handle("el => el.parentElement") if time_el else None
                tweet_href = ""
                if time_parent:
                    tweet_href = await time_parent.get_attribute("href") or ""

                tweet_id = ""
                m = re.search(r"/status/(\d+)", tweet_href)
                if m:
                    tweet_id = m.group(1)
                else:
                    tweet_id = hashlib.sha1(text[:100].encode()).hexdigest()[:16]

                # Timestamp
                published_at = None
                if time_el:
                    dt_str = await time_el.get_attribute("datetime")
                    if dt_str:
                        try:
                            published_at = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
                        except ValueError:
                            pass

                # Image
                img_el = await tw.query_selector('img[src*="pbs.twimg.com/media"]')
                image_url = await img_el.get_attribute("src") if img_el else None

                if text:
                    results.append({
                        "text": text[:1000],
                        "handle": handle,
                        "tweet_id": tweet_id,
                        "published_at": published_at,
                        "image_url": image_url,
                        "tweet_url": f"https://x.com/{handle}/status/{tweet_id}" if handle and tweet_id else url,
                    })
            except Exception as e:
                logger.debug(f"Tweet parse error: {e}")
                continue

        await browser.close()
        await pw.stop()
        return results

    except Exception as e:
        logger.warning(f"X scrape failed for {url}: {e}")
        return []


def fetch_x_feed(accounts: list[dict], max_per_account: int = 10) -> list[dict]:
    """Fetch tweets from X accounts using Playwright with saved session."""
    all_items: list[dict] = []

    async def _run():
        for acc in accounts:
            handle = acc.get("handle", "")
            tags = acc.get("tags", [])
            if not handle:
                continue

            url = f"https://x.com/{handle}"
            tweets = await _scrape_x_profile(url, max_tweets=max_per_account)

            for tw in tweets:
                all_items.append({
                    "source": "x",
                    "external_id": tw["tweet_id"],
                    "url": tw["tweet_url"],
                    "title": tw["text"][:200],
                    "excerpt": tw["text"][:1000] if len(tw["text"]) > 200 else None,
                    "content_md": tw["text"],
                    "image_url": tw["image_url"],
                    "author": f"@{tw['handle']}" if tw["handle"] else f"@{handle}",
                    "published_at": tw["published_at"],
                    "tags": ["x"] + tags,
                    "feed_metadata": {
                        "handle": tw["handle"] or handle,
                        "source_account": handle,
                        "via": "playwright",
                    },
                })

            logger.info(f"X @{handle}: {len(tweets)} tweets")

    # Windows 이벤트루프 격리: 앱 전역은 SelectorEventLoop(psycopg)지만 Playwright 는
    # ProactorEventLoop 필요 → 전용 스레드 + Proactor 루프에서 실행 (_browser_session).
    from app.sources._browser_session import run_browser_coro
    run_browser_coro(_run)

    logger.info(f"X feed: {len(all_items)} tweets from {len(accounts)} accounts")
    return all_items
