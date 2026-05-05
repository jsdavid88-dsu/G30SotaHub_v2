"""Reddit source — recent posts from VFX-relevant subreddits.

Uses PRAW. Requires REDDIT_CLIENT_ID/SECRET in .env.
If credentials missing, returns empty list.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.sources.base import FetchedItem

logger = logging.getLogger(__name__)


def _get_reddit():
    if not settings.reddit_client_id or not settings.reddit_client_secret:
        return None
    try:
        import praw  # noqa: WPS433

        return praw.Reddit(
            client_id=settings.reddit_client_id,
            client_secret=settings.reddit_client_secret,
            user_agent=settings.reddit_user_agent,
            check_for_async=False,
        )
    except Exception as e:
        logger.warning(f"PRAW init failed: {e}")
        return None


def fetch_reddit(
    subreddits: list[str] | None = None,
    keywords: list[str] | None = None,
    days_back: int = 3,
    max_per_sub: int = 20,
) -> list[FetchedItem]:
    """Fetch recent posts from given subreddits, filter by keywords."""
    subreddits = subreddits or []
    keywords = keywords or []
    if not subreddits:
        return []

    reddit = _get_reddit()
    if not reddit:
        logger.info("Reddit credentials missing — skipping source")
        return []

    cutoff = (datetime.now(timezone.utc) - timedelta(days=days_back)).timestamp()
    kw_lower = [k.lower() for k in keywords]
    items: list[FetchedItem] = []

    for sub_name in subreddits:
        try:
            sub = reddit.subreddit(sub_name)
            for post in sub.new(limit=max_per_sub):
                if post.created_utc < cutoff:
                    continue

                text = f"{post.title} {post.selftext or ''}".lower()
                if kw_lower and not any(kw in text for kw in kw_lower):
                    continue

                published = datetime.fromtimestamp(post.created_utc, tz=timezone.utc)
                items.append(
                    FetchedItem(
                        source="reddit",
                        external_id=post.id,
                        url=f"https://reddit.com{post.permalink}",
                        title=post.title,
                        abstract=(post.selftext or "")[:1000] if post.selftext else None,
                        authors=str(post.author) if post.author else None,
                        published_at=published,
                        metadata={
                            "subreddit": sub_name,
                            "score": post.score,
                            "num_comments": post.num_comments,
                            "upvote_ratio": post.upvote_ratio,
                            "is_self": post.is_self,
                        },
                    )
                )
        except Exception as e:
            logger.warning(f"Reddit sub '{sub_name}' fetch failed: {e}")
            continue

    logger.info(f"Reddit: {len(items)} posts")
    return items
