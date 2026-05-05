"""X/Twitter source — via api.fxtwitter.com (no API key).

Fetches recent tweets for given accounts using the fxtwitter proxy.

Note: fxtwitter's API provides single-tweet fetch by ID, not user timelines.
For account monitoring we rely on fetching their known tweet IDs (passed
in metadata or discovered via RSS alternatives like nitter). As a simple
v1, this module accepts a list of tweet URLs/IDs to fetch and normalize.

Phase 3+ can add discovery via RSS or scraping if needed.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

import httpx

from app.sources.base import FetchedItem

logger = logging.getLogger(__name__)

TWEET_URL_RE = re.compile(r"(?:x|twitter)\.com/(\w+)/status/(\d+)")


def _parse_tweet_payload(data: dict) -> FetchedItem | None:
    try:
        tweet = data.get("tweet") or {}
        if not tweet:
            return None

        tweet_id = str(tweet.get("id") or "")
        author = tweet.get("author") or {}
        handle = author.get("screen_name") or ""
        name = author.get("name") or handle

        if not tweet_id:
            return None

        created_raw = tweet.get("created_at") or tweet.get("created_timestamp")
        published_at: datetime | None = None
        if created_raw:
            try:
                if isinstance(created_raw, (int, float)):
                    published_at = datetime.fromtimestamp(int(created_raw), tz=timezone.utc)
                else:
                    # "Thu Apr 10 12:34:56 +0000 2026" or ISO
                    try:
                        published_at = datetime.fromisoformat(str(created_raw).replace("Z", "+00:00"))
                    except ValueError:
                        published_at = datetime.strptime(
                            str(created_raw), "%a %b %d %H:%M:%S %z %Y"
                        )
            except (ValueError, TypeError):
                published_at = None

        text = tweet.get("text") or ""
        url = tweet.get("url") or f"https://x.com/{handle}/status/{tweet_id}"

        return FetchedItem(
            source="x",
            external_id=tweet_id,
            url=url,
            title=text[:200] if text else f"Tweet by @{handle}",
            abstract=text,
            authors=f"@{handle}" + (f" ({name})" if name and name != handle else ""),
            published_at=published_at,
            metadata={
                "handle": handle,
                "likes": tweet.get("likes", 0),
                "retweets": tweet.get("retweets", 0),
                "replies": tweet.get("replies", 0),
                "views": tweet.get("views", 0),
                "has_media": bool(tweet.get("media")),
            },
        )
    except Exception as e:
        logger.warning(f"fxtwitter parse failed: {e}")
        return None


def fetch_x_tweet(tweet_url_or_id: str, handle_hint: str | None = None) -> FetchedItem | None:
    """Fetch a single tweet by URL or ID via api.fxtwitter.com."""
    # Resolve to handle + id
    handle, tweet_id = handle_hint, None
    m = TWEET_URL_RE.search(tweet_url_or_id)
    if m:
        handle, tweet_id = m.group(1), m.group(2)
    elif tweet_url_or_id.isdigit():
        tweet_id = tweet_url_or_id

    if not tweet_id:
        return None

    # fxtwitter accepts handle+id; if no handle, try generic endpoint
    if handle:
        url = f"https://api.fxtwitter.com/{handle}/status/{tweet_id}"
    else:
        url = f"https://api.fxtwitter.com/status/{tweet_id}"

    try:
        r = httpx.get(url, timeout=20, follow_redirects=True)
        r.raise_for_status()
        return _parse_tweet_payload(r.json())
    except Exception as e:
        logger.warning(f"fxtwitter fetch failed for {tweet_id}: {e}")
        return None


def fetch_x(
    accounts: list[str] | None = None,
    tweet_ids: list[str] | None = None,
    **_: object,
) -> list[FetchedItem]:
    """Fetch tweets.

    Two modes:
    1. tweet_ids: explicit list of tweet IDs/URLs to fetch
    2. accounts: currently not supported (fxtwitter has no timeline API)
                 — Phase 3 may add nitter RSS fallback

    For now returns empty if only accounts given without tweet_ids.
    """
    items: list[FetchedItem] = []

    if tweet_ids:
        for tid in tweet_ids:
            item = fetch_x_tweet(tid)
            if item:
                items.append(item)

    if accounts and not tweet_ids:
        logger.info(
            f"X accounts provided ({len(accounts)}) but no tweet_ids — "
            "fxtwitter has no timeline API. Skipping."
        )

    logger.info(f"X: {len(items)} tweets")
    return items
