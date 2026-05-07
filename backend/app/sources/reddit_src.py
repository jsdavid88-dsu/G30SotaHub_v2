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
    cid = settings.reddit_client_id
    csec = settings.reddit_client_secret
    has_cid = bool(cid)
    has_csec = bool(csec)
    if not has_cid or not has_csec:
        logger.warning(
            f"[reddit] credentials missing — has_client_id={has_cid}, has_secret={has_csec}. "
            f"Check REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET in .env"
        )
        return None
    try:
        import praw  # noqa: WPS433

        r = praw.Reddit(
            client_id=cid,
            client_secret=csec,
            user_agent=settings.reddit_user_agent,
            check_for_async=False,
        )
        # 인증 검증 (read_only 면 application-only auth 통과)
        try:
            _ = r.read_only
            logger.info(f"[reddit] PRAW init ok (read_only={r.read_only}, ua={settings.reddit_user_agent!r})")
        except Exception as auth_e:
            logger.warning(f"[reddit] PRAW init OK but auth verify failed: {auth_e}")
        return r
    except Exception as e:
        logger.warning(f"[reddit] PRAW init failed: {type(e).__name__}: {e}")
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
        logger.info("[reddit] no subreddits provided — return []")
        return []

    reddit = _get_reddit()
    if not reddit:
        logger.info("[reddit] _get_reddit() returned None — skipping fetch")
        return []

    cutoff = (datetime.now(timezone.utc) - timedelta(days=days_back)).timestamp()
    kw_lower = [k.lower() for k in keywords]
    items: list[FetchedItem] = []
    per_sub_seen = 0
    per_sub_kept = 0

    for sub_name in subreddits:
        sub_seen = 0
        sub_kept = 0
        try:
            sub = reddit.subreddit(sub_name)
            for post in sub.new(limit=max_per_sub):
                sub_seen += 1
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
                sub_kept += 1
            logger.info(f"[reddit] r/{sub_name}: scanned={sub_seen}, kept={sub_kept} (kw filter={len(kw_lower)})")
            per_sub_seen += sub_seen
            per_sub_kept += sub_kept
        except Exception as e:
            logger.warning(f"[reddit] r/{sub_name} fetch failed: {type(e).__name__}: {e}")
            continue

    logger.info(f"[reddit] total: scanned={per_sub_seen}, kept={per_sub_kept} from {len(subreddits)} subs")
    return items
