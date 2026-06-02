# GitHub source — 공식 Search API 기반 (이슈 #7).
# 기존: Crawl4AI 로 Google(site:github.com) 스크래핑 → 봇 검출 시 silent 0건.
# 변경: api.github.com/search/repositories — 안정적 + 상세(stars/desc/...)를 한 번에.
#       GITHUB_TOKEN 있으면 rate limit 완화 (search: unauth 10/min → auth 30/min).
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone

os.environ.setdefault("PYTHONIOENCODING", "utf-8")

import httpx
from app.sources.base import FetchedItem, get_with_retry

logger = logging.getLogger(__name__)

# GitHub UI/navigation owner (검색 결과엔 거의 안 섞이지만 방어적 필터 유지)
GITHUB_NOISE_OWNERS = {
    "features", "enterprise", "pricing", "security", "customer-stories",
    "readme", "topics", "collections", "trending", "explore", "search",
    "login", "signup", "settings", "notifications", "marketplace",
    "sponsors", "orgs", "codespaces", "copilot", "solutions", "resources",
    "about", "team", "blog", "contact", "events", "education",
}


def _is_real_repo(name: str) -> bool:
    parts = name.split("/")
    if len(parts) != 2:
        return False
    owner, repo = parts
    if owner.lower() in GITHUB_NOISE_OWNERS:
        return False
    if "?" in name or "#" in name:
        return False
    return True


def _search_github_api(query: str, max_results: int = 30) -> list[dict]:
    """GitHub Search API — 결과 repo 객체 리스트 (full_name/description/stars/... 포함)."""
    from app.config import settings

    headers = {"Accept": "application/vnd.github.v3+json"}
    if getattr(settings, "github_token", None):
        headers["Authorization"] = f"Bearer {settings.github_token}"

    try:
        r = get_with_retry(
            "https://api.github.com/search/repositories",
            params={
                "q": query,
                "sort": "stars",
                "order": "desc",
                "per_page": min(max_results, 100),
            },
            headers=headers,
            timeout=15,
        )
        if r.status_code != 200:
            remaining = r.headers.get("X-RateLimit-Remaining", "?")
            logger.warning(
                f"[github] search API {r.status_code} "
                f"(rate-remaining={remaining}): {r.text[:150]}"
            )
            return []
        data = r.json()
        items = data.get("items", []) or []
        logger.info(f"[github] search API ok: total_count={data.get('total_count', '?')}, returned={len(items)}")
        return items
    except Exception as e:
        logger.warning(f"[github] search API exception: {type(e).__name__}: {e}")
        return []


def fetch_github(
    keywords: list[str] | None = None,
    topics: list[str] | None = None,
    days_back: int = 7,
    max_results: int = 30,
) -> list[FetchedItem]:
    """GitHub 공식 Search API 로 저장소 검색."""
    keywords = keywords or []
    topics = topics or []
    if not keywords and not topics:
        logger.info("[github] keywords/topics 둘 다 비어있음 — skip")
        return []

    # GitHub search query 빌드.
    # 주의(#7 Task1): GitHub search 는 공백=AND. 키워드를 전부 AND 로 묶으면 거의 0건
    # (실측: AND=0 / OR 3개=57). → 키워드는 OR 로 묶어 recall 확보, qualifier(stars/pushed)만 AND.
    kw_terms = [f'"{kw}"' if " " in kw else kw for kw in keywords[:5]]
    kw_terms += [f"topic:{t}" for t in topics[:3]]
    or_part = " OR ".join(kw_terms)
    since = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y-%m-%d")
    query = (f"{or_part} stars:>10 pushed:>{since}").strip() if or_part else f"stars:>10 pushed:>{since}"
    logger.info(f"GitHub search (API): {query}")

    repos = _search_github_api(query, max_results)
    logger.info(f"GitHub: found {len(repos)} repos (API)")

    items: list[FetchedItem] = []
    for info in repos[:max_results]:
        name = info.get("full_name", "")
        if not name or not _is_real_repo(name):
            continue
        pushed = info.get("pushed_at")
        published_at = None
        if pushed:
            try:
                published_at = datetime.fromisoformat(pushed.replace("Z", "+00:00"))
            except ValueError:
                pass
        items.append(FetchedItem(
            source="github",
            external_id=name,
            url=info.get("html_url", f"https://github.com/{name}"),
            title=info.get("name", name.split("/")[-1]),
            abstract=info.get("description") or "",
            authors=(info.get("owner") or {}).get("login", ""),
            published_at=published_at,
            metadata={
                "stars": info.get("stargazers_count", 0),
                "forks": info.get("forks_count", 0),
                "language": info.get("language"),
                "topics": info.get("topics", []),
                "license": (info.get("license") or {}).get("spdx_id"),
            },
        ))

    logger.info(f"GitHub: {len(items)} repos fetched (API)")
    return items
