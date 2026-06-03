"""Reddit feed source — PRAW (공식 API).

#7 (5090 실측): 비인증 `.json` 스크래핑(`reddit.com/r/{sub}/new.json`)은 Reddit 이 403 으로 막음.
→ PRAW 로 전환. `.env` 의 REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET 필요 (reddit_src.py 와 동일 자격증명).
키가 없으면 graceful 하게 빈 리스트 반환(에러 X). PRAW 는 동기 — feed_crawler 가 스레드(run_in_executor)
에서 호출하므로 이벤트루프 이슈 없음.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)


def fetch_reddit_feed(
    subreddits: list[str],
    keywords: list[str],
    days_back: int = 3,
    max_per_sub: int = 15,
) -> list[dict]:
    """PRAW 로 subreddit 최신글 수집 → feed dict 리스트."""
    subreddits = subreddits or []
    keywords = keywords or []
    if not subreddits:
        return []

    # reddit_src 의 PRAW 클라이언트 재사용 (.env 자격증명 로드 + 인증 검증 포함)
    from app.sources.reddit_src import _get_reddit
    reddit = _get_reddit()
    if not reddit:
        logger.info("[feed_reddit] PRAW 자격증명 없음(.env REDDIT_CLIENT_ID/SECRET) — skip")
        return []

    cutoff = (datetime.now(timezone.utc) - timedelta(days=days_back)).timestamp()
    kw_lower = [k.lower() for k in keywords]
    out: list[dict] = []

    for sub_name in subreddits:
        kept = 0
        try:
            for post in reddit.subreddit(sub_name).new(limit=max_per_sub * 2):
                if kept >= max_per_sub:
                    break
                created = getattr(post, "created_utc", 0) or 0
                if created < cutoff:
                    continue

                title = getattr(post, "title", "") or ""
                selftext = getattr(post, "selftext", "") or ""
                text = f"{title} {selftext}".lower()
                if kw_lower and not any(kw in text for kw in kw_lower):
                    continue

                post_id = getattr(post, "id", "")
                if not post_id:
                    continue

                # 이미지 (가능하면)
                image_url = None
                thumb = getattr(post, "thumbnail", "") or ""
                if isinstance(thumb, str) and thumb.startswith("http"):
                    image_url = thumb
                try:
                    preview = getattr(post, "preview", None)
                    if isinstance(preview, dict):
                        imgs = preview.get("images", [])
                        if imgs and imgs[0].get("source"):
                            image_url = imgs[0]["source"].get("url") or image_url
                except Exception:
                    pass

                permalink = getattr(post, "permalink", "") or ""
                matched = [kw for kw in kw_lower if kw in text][:5]
                tags = list({*matched, sub_name.lower()})

                out.append({
                    "source": "reddit",
                    "external_id": post_id,
                    "url": f"https://reddit.com{permalink}" if permalink else (getattr(post, "url", "") or ""),
                    "title": title[:500],
                    "excerpt": (selftext[:500] if selftext else None),
                    "content_md": None,
                    "image_url": image_url,
                    "author": (str(getattr(post, "author", "")) or None),
                    "published_at": datetime.fromtimestamp(created, tz=timezone.utc) if created else None,
                    "tags": tags,
                    "feed_metadata": {
                        "subreddit": sub_name,
                        "score": getattr(post, "score", 0),
                        "num_comments": getattr(post, "num_comments", 0),
                        "upvote_ratio": getattr(post, "upvote_ratio", 0),
                        "is_self": getattr(post, "is_self", False),
                        "flair": getattr(post, "link_flair_text", None),
                    },
                })
                kept += 1
            logger.info(f"[feed_reddit] r/{sub_name}: {kept} posts")
        except Exception as e:
            logger.warning(f"[feed_reddit] r/{sub_name} failed: {type(e).__name__}: {e}")
            continue

    logger.info(f"Reddit feed: {len(out)} posts from {len(subreddits)} subs (PRAW)")
    return out
