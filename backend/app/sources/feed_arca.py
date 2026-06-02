"""아카라이브(arca.live) feed — Playwright + 저장된 로그인 세션으로 채널 글목록 수집.

login_helper.py 로 만든 공용 프로필(data/x_browser_profile)을 재사용 → Cloudflare/로그인 통과.
설정(feed_queries.yaml):
    arca:
      channels:
        - slug: "aiart"
          tags: ["ai-art"]
      max_per_channel: 15

수집 결과는 FeedItem 으로 저장되고, night_batch 의 Gemma4 필터/스코어 파이프라인이 자동 처리.

주의: 아카 DOM 선택자는 5090(로그인 상태)에서 실측 검증 필요 — 0건이면 선택자 조정.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from app.sources._browser_session import (
    DEFAULT_UA,
    IGNORE_DEFAULT_ARGS,
    LAUNCH_ARGS,
    PROFILE_DIR,
    run_browser_coro,
)

logger = logging.getLogger(__name__)

ARCA_BASE = "https://arca.live"
# 글 행 선택자 — 우선순위대로 시도 (아카 DOM 변동 대비 fallback)
_ROW_SELECTORS = ["a.vrow.column", ".article-list a.vrow", 'a[href*="/b/"]']
_TITLE_SELECTORS = [".title", ".vcol.col-title", ".article-title"]


async def _scrape_channel(slug: str, max_posts: int, tags: list[str]) -> list[dict]:
    if not PROFILE_DIR.exists():
        logger.warning("[arca] 로그인 프로필 없음 — `python login_helper.py` 먼저 실행")
        return []

    from playwright.async_api import async_playwright

    out: list[dict] = []
    pw = await async_playwright().start()
    try:
        ctx = await pw.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE_DIR),
            headless=True,
            args=LAUNCH_ARGS,
            ignore_default_args=IGNORE_DEFAULT_ARGS,
            user_agent=DEFAULT_UA,
        )
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        url = f"{ARCA_BASE}/b/{slug}"
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        except Exception as e:
            logger.warning(f"[arca] /b/{slug} goto 실패: {e}")
        await asyncio.sleep(3)  # Cloudflare/JS 렌더 대기

        rows = []
        for sel in _ROW_SELECTORS:
            rows = await page.query_selector_all(sel)
            if rows:
                break
        if not rows:
            logger.warning(f"[arca] /b/{slug}: 글 행 0개 — 로그인/Cloudflare/선택자 확인 필요")

        for row in rows:
            try:
                href = await row.get_attribute("href") or ""
                if "/b/" not in href:
                    continue
                cls = (await row.get_attribute("class")) or ""
                if "notice" in cls:  # 공지/고정글 제외
                    continue

                title = ""
                for tsel in _TITLE_SELECTORS:
                    tel = await row.query_selector(tsel)
                    if tel:
                        title = (await tel.inner_text()).strip()
                        if title:
                            break
                if not title:
                    continue

                aid = href.rstrip("/").split("/")[-1].split("?")[0]
                if not aid.isdigit():
                    continue

                published_at = None
                time_el = await row.query_selector("time")
                if time_el:
                    dt = await time_el.get_attribute("datetime")
                    if dt:
                        try:
                            published_at = datetime.fromisoformat(dt.replace("Z", "+00:00"))
                        except ValueError:
                            pass

                full_url = href if href.startswith("http") else f"{ARCA_BASE}{href}"
                out.append({
                    "source": "arca",
                    "external_id": f"{slug}:{aid}",
                    "url": full_url,
                    "title": title[:500],
                    "excerpt": None,
                    "content_md": None,
                    "image_url": None,
                    "author": None,
                    "published_at": published_at,
                    "tags": ["arca", slug] + (tags or []),
                    "feed_metadata": {"channel": slug, "via": "playwright"},
                })
                if len(out) >= max_posts:
                    break
            except Exception as e:
                logger.debug(f"[arca] row parse 실패: {e}")
                continue

        await ctx.close()
    except Exception as e:
        logger.warning(f"[arca] /b/{slug} 실패: {type(e).__name__}: {e}")
    finally:
        await pw.stop()

    logger.info(f"[arca] /b/{slug}: {len(out)} posts")
    return out


def fetch_arca_feed(channels: list, max_per_channel: int = 15) -> list[dict]:
    """아카 채널 글목록 수집. channels=[{slug, tags?}] 또는 ["slug", ...]."""
    async def _run() -> list[dict]:
        items: list[dict] = []
        for ch in channels:
            if isinstance(ch, dict):
                slug = ch.get("slug", "")
                tags = ch.get("tags", [])
            else:
                slug, tags = str(ch), []
            if not slug:
                continue
            items.extend(await _scrape_channel(slug, max_per_channel, tags))
        return items

    items = run_browser_coro(_run)
    logger.info(f"[arca] feed: {len(items)} posts from {len(channels)} channels")
    return items
