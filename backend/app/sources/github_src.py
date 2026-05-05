# GitHub source — Crawl4AI based (no API key, no rate limit).
# Searches github.com directly and extracts repo info.
from __future__ import annotations

import asyncio
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from urllib.parse import quote_plus

os.environ.setdefault("PYTHONIOENCODING", "utf-8")

import httpx
from app.sources.base import FetchedItem

logger = logging.getLogger(__name__)

# GitHub navigation/feature paths to exclude
GITHUB_NOISE_OWNERS = {
    "features", "enterprise", "pricing", "security", "customer-stories",
    "readme", "topics", "collections", "trending", "explore", "search",
    "login", "signup", "settings", "notifications", "marketplace",
    "sponsors", "orgs", "codespaces", "copilot", "solutions", "resources",
    "about", "team", "blog", "contact", "events", "education",
}
GITHUB_NOISE_REPOS = {
    "industry", "use-case", "articles", "events", "whitepapers",
    "executive-insights", "startups",
}


def _is_real_repo(name: str) -> bool:
    """Filter out GitHub UI links that look like repos but aren't."""
    parts = name.split("/")
    if len(parts) != 2:
        return False
    owner, repo = parts
    if owner.lower() in GITHUB_NOISE_OWNERS:
        return False
    if repo.lower() in GITHUB_NOISE_REPOS:
        return False
    if "?" in name or "#" in name:
        return False
    if repo.startswith("articles") or repo.startswith("topic="):
        return False
    return True


async def _search_github_crawl4ai(query: str, max_results: int = 20) -> list[str]:
    """Search GitHub repos via Google (site:github.com) — avoids GitHub login wall."""
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

    search_url = (
        f"https://www.google.com/search?q=site:github.com+{quote_plus(query)}"
        f"&num={max_results * 2}"
    )

    try:
        cfg = BrowserConfig(headless=True, verbose=False)
        run_cfg = CrawlerRunConfig(verbose=False, word_count_threshold=10)
        async with AsyncWebCrawler(config=cfg) as crawler:
            result = await crawler.arun(url=search_url, config=run_cfg)
            if not result.success:
                logger.warning(f"GitHub search crawl failed: {result.error_message}")
                return []

            links = result.links or {}
            all_links = links.get("external", [])
            repos = []
            seen = set()
            for link in all_links:
                href = link.get("href", "")
                m = re.match(r"https?://github\.com/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)", href)
                if m:
                    name = m.group(1)
                    if name not in seen and _is_real_repo(name):
                        seen.add(name)
                        repos.append(name)
                if len(repos) >= max_results:
                    break

            return repos
    except Exception as e:
        logger.warning(f"GitHub crawl search failed: {e}")
        return []


def _fetch_repo_info(full_name: str) -> dict | None:
    """Fetch repo metadata via GitHub's public JSON (no auth needed)."""
    try:
        r = httpx.get(
            f"https://api.github.com/repos/{full_name}",
            timeout=10,
            headers={"Accept": "application/vnd.github.v3+json"},
        )
        if r.status_code == 200:
            return r.json()
        # Rate limited or not found — use basic info
        return None
    except Exception:
        return None


def fetch_github(
    keywords: list[str] | None = None,
    topics: list[str] | None = None,
    days_back: int = 7,
    max_results: int = 30,
) -> list[FetchedItem]:
    """Search GitHub for repositories via Crawl4AI web scraping."""
    keywords = keywords or []
    topics = topics or []
    if not keywords and not topics:
        return []

    # Build search query
    kw_parts = []
    for kw in keywords[:5]:
        if " " in kw:
            kw_parts.append(f'"{kw}"')
        else:
            kw_parts.append(kw)
    for t in topics[:3]:
        kw_parts.append(t.replace("-", " "))

    query = " ".join(kw_parts) + " stars:>10"
    logger.info(f"GitHub search (Crawl4AI): {query}")

    # Run async search
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as pool:
            repo_names = pool.submit(
                lambda: asyncio.run(_search_github_crawl4ai(query, max_results))
            ).result()
    else:
        repo_names = asyncio.run(_search_github_crawl4ai(query, max_results))

    logger.info(f"GitHub: found {len(repo_names)} repos")

    # Fetch details for each repo (via API if available, basic if rate limited)
    items: list[FetchedItem] = []
    for name in repo_names[:max_results]:
        info = _fetch_repo_info(name)

        if info:
            pushed = info.get("pushed_at")
            published_at = None
            if pushed:
                try:
                    published_at = datetime.fromisoformat(pushed.replace("Z", "+00:00"))
                except ValueError:
                    pass

            items.append(FetchedItem(
                source="github",
                external_id=info.get("full_name", name),
                url=info.get("html_url", f"https://github.com/{name}"),
                title=info.get("name", name.split("/")[-1]),
                abstract=info.get("description") or "",
                authors=info.get("owner", {}).get("login", ""),
                published_at=published_at,
                metadata={
                    "stars": info.get("stargazers_count", 0),
                    "forks": info.get("forks_count", 0),
                    "language": info.get("language"),
                    "topics": info.get("topics", []),
                    "license": (info.get("license") or {}).get("spdx_id"),
                },
            ))
        else:
            # Basic info without API (rate limited)
            items.append(FetchedItem(
                source="github",
                external_id=name,
                url=f"https://github.com/{name}",
                title=name.split("/")[-1],
                abstract="",
                authors=name.split("/")[0],
                published_at=None,
                metadata={"stars": 0},
            ))

    logger.info(f"GitHub: {len(items)} repos fetched")
    return items
