"""Crawl4AI source — web search + content extraction via local Crawl4AI.

Replaces Firecrawl (Docker) with Crawl4AI (pip install, no Docker needed).
Uses headless Chromium via Playwright for JS rendering.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
from datetime import datetime, timezone

import os
os.environ.setdefault("PYTHONIOENCODING", "utf-8")

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

logger = logging.getLogger(__name__)

# Reuse a single browser config for all crawls
_browser_cfg = BrowserConfig(headless=True, verbose=False)


async def _crawl_url(url: str) -> dict | None:
    """Crawl a single URL and return structured data."""
    try:
        async with AsyncWebCrawler(config=_browser_cfg) as crawler:
            run_cfg = CrawlerRunConfig(
                word_count_threshold=50,
                excluded_tags=["nav", "footer", "header"],
                process_iframes=False,
                verbose=False,
            )
            result = await crawler.arun(url=url, config=run_cfg)
            if not result.success:
                logger.warning(f"crawl4ai failed for {url}: {result.error_message}")
                return None
            return {
                "url": result.url,
                "title": (result.metadata or {}).get("title", ""),
                "description": (result.metadata or {}).get("description", ""),
                "markdown": result.markdown or "",
                "metadata": result.metadata or {},
            }
    except Exception as e:
        logger.warning(f"crawl4ai error for {url}: {e}")
        return None


async def search_crawl4ai(query: str, limit: int = 5, tags: list[str] | None = None) -> list[dict]:
    """Search Google via Crawl4AI and return feed_item dicts.

    Uses Google search results page, then crawls top results.
    """
    # Build Google search URL
    from urllib.parse import quote_plus
    search_url = f"https://www.google.com/search?q={quote_plus(query)}&num={limit * 2}"

    try:
        async with AsyncWebCrawler(config=_browser_cfg) as crawler:
            run_cfg = CrawlerRunConfig(
                word_count_threshold=10,
                excluded_tags=["nav", "footer", "header"],
                verbose=False,
            )
            result = await crawler.arun(url=search_url, config=run_cfg)
            if not result.success:
                logger.warning(f"crawl4ai Google search failed: {result.error_message}")
                return []

            # Extract links from the search results
            links = []
            for link in (result.links or {}).get("external", []):
                href = link.get("href", "")
                text = link.get("text", "")
                # Filter out Google's own links
                if href and "google.com" not in href and text and len(text) > 10:
                    links.append({"url": href, "text": text})
                if len(links) >= limit:
                    break

            if not links:
                logger.info(f"crawl4ai: no search results for '{query}'")
                return []

    except Exception as e:
        logger.warning(f"crawl4ai Google search error: {e}")
        return []

    # Crawl each result page
    out: list[dict] = []
    for link in links:
        page = await _crawl_url(link["url"])
        if not page:
            continue

        title = page["title"] or link["text"]
        markdown = page["markdown"]
        description = page["description"] or markdown[:400].strip()
        metadata = page["metadata"]

        image_url = (
            metadata.get("og:image")
            or metadata.get("ogImage")
            or metadata.get("image")
        )
        author = metadata.get("author") or metadata.get("og:site_name")

        published = None
        for key in ("publishedTime", "published_time", "datePublished", "article:published_time"):
            val = metadata.get(key)
            if val:
                try:
                    published = datetime.fromisoformat(str(val).replace("Z", "+00:00"))
                    break
                except ValueError:
                    pass

        external_id = hashlib.sha1(link["url"].encode("utf-8")).hexdigest()[:24]

        out.append({
            "source": "crawl4ai",
            "external_id": external_id,
            "url": link["url"],
            "title": title[:500],
            "excerpt": (description or "")[:1000] or None,
            "content_md": (markdown or "")[:30000] or None,
            "image_url": image_url,
            "author": author,
            "published_at": published,
            "tags": tags or [],
            "feed_metadata": {
                "search_query": query,
                "domain": metadata.get("og:url") or link["url"],
            },
        })

    logger.info(f"crawl4ai: '{query}' -> {len(out)} results")
    return out


def fetch_crawl4ai_feed(queries: list[dict]) -> list[dict]:
    """Run all configured Crawl4AI queries (sync wrapper for async)."""
    async def _run():
        all_items: list[dict] = []
        for q in queries:
            query_text = q.get("query", "")
            if not query_text:
                continue
            tags = q.get("tags", [])
            limit = int(q.get("limit", 5))
            items = await search_crawl4ai(query_text, limit=limit, tags=tags)
            all_items.extend(items)
        return all_items

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        # Already in async context — run in new thread
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as pool:
            return pool.submit(lambda: asyncio.run(_run())).result()
    else:
        return asyncio.run(_run())
