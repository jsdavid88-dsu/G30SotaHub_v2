"""Reddit feed source — uses Reddit's public JSON API (no API key, no PRAW).

Reddit returns JSON when you append .json to any listing URL:
  https://www.reddit.com/r/comfyui/new.json?limit=15

No API key, no OAuth, no PRAW needed.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import httpx

logger = logging.getLogger(__name__)

HEADERS = {"User-Agent": "VFX-SOTA-Monitor/1.0"}


def fetch_reddit_feed(
    subreddits: list[str],
    keywords: list[str],
    days_back: int = 3,
    max_per_sub: int = 15,
) -> list[dict]:
    """Fetch recent posts from subreddits via Reddit public JSON API."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days_back)).timestamp()
    kw_lower = [k.lower() for k in keywords]
    out: list[dict] = []

    for sub_name in subreddits:
        url = f"https://www.reddit.com/r/{sub_name}/new.json"
        try:
            r = httpx.get(
                url,
                params={"limit": max_per_sub * 2},  # fetch extra, filter later
                headers=HEADERS,
                timeout=15,
                follow_redirects=True,
            )
            if r.status_code != 200:
                logger.warning(f"Reddit r/{sub_name}: HTTP {r.status_code}")
                continue

            data = r.json()
            posts = data.get("data", {}).get("children", [])

            for p in posts:
                post = p.get("data", {})
                if not post:
                    continue

                created = post.get("created_utc", 0)
                if created < cutoff:
                    continue

                title = post.get("title", "")
                selftext = post.get("selftext", "")
                text = f"{title} {selftext}".lower()

                # Keyword filter
                if kw_lower and not any(kw in text for kw in kw_lower):
                    continue

                published = datetime.fromtimestamp(created, tz=timezone.utc)
                permalink = post.get("permalink", "")

                # Image
                image_url = None
                thumbnail = post.get("thumbnail", "")
                if thumbnail and thumbnail.startswith("http"):
                    image_url = thumbnail
                preview = post.get("preview", {})
                if isinstance(preview, dict):
                    images = preview.get("images", [])
                    if images and images[0].get("source"):
                        image_url = images[0]["source"].get("url")

                # Tags
                matched_tags = [kw for kw in kw_lower if kw in text][:5]
                matched_tags = list({*matched_tags, sub_name.lower()})

                post_id = post.get("id", "")
                if not post_id:
                    continue

                out.append({
                    "source": "reddit",
                    "external_id": post_id,
                    "url": f"https://reddit.com{permalink}" if permalink else "",
                    "title": title[:500],
                    "excerpt": (selftext[:500] if selftext else None),
                    "content_md": None,
                    "image_url": image_url,
                    "author": post.get("author"),
                    "published_at": published,
                    "tags": matched_tags,
                    "feed_metadata": {
                        "subreddit": sub_name,
                        "score": post.get("score", 0),
                        "num_comments": post.get("num_comments", 0),
                        "upvote_ratio": post.get("upvote_ratio", 0),
                        "is_self": post.get("is_self", False),
                        "flair": post.get("link_flair_text"),
                    },
                })

                if len([o for o in out if o["feed_metadata"]["subreddit"] == sub_name]) >= max_per_sub:
                    break

        except Exception as e:
            logger.warning(f"Reddit r/{sub_name} failed: {e}")
            continue

    logger.info(f"Reddit feed: {len(out)} posts from {len(subreddits)} subs")
    return out
