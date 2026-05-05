"""YouTube feed source — via channel RSS (no API key needed).

Each YouTube channel has a public RSS feed at:
  https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID
"""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime
from xml.etree import ElementTree

import httpx

logger = logging.getLogger(__name__)

ATOM_NS = "{http://www.w3.org/2005/Atom}"
MEDIA_NS = "{http://search.yahoo.com/mrss/}"


def fetch_youtube_feed(channels: list[dict], max_per_channel: int = 5) -> list[dict]:
    """Fetch recent videos from YouTube channel RSS feeds."""
    all_items: list[dict] = []

    for ch in channels:
        channel_id = ch.get("channel_id", "")
        name = ch.get("name", channel_id)
        tags = ch.get("tags", [])

        if not channel_id:
            continue

        rss_url = f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
        try:
            r = httpx.get(rss_url, timeout=15, follow_redirects=True)
            if r.status_code != 200:
                logger.warning(f"YouTube RSS {name}: HTTP {r.status_code}")
                continue

            root = ElementTree.fromstring(r.text)
            entries = root.findall(f"{ATOM_NS}entry")

            for entry in entries[:max_per_channel]:
                video_id = (entry.findtext(f"{ATOM_NS}videoId")
                            or entry.findtext("yt:videoId")
                            or "")
                if not video_id:
                    # Extract from link
                    link_el = entry.find(f"{ATOM_NS}link")
                    href = link_el.get("href", "") if link_el is not None else ""
                    if "v=" in href:
                        video_id = href.split("v=")[-1].split("&")[0]

                title = entry.findtext(f"{ATOM_NS}title") or ""
                published = entry.findtext(f"{ATOM_NS}published")
                author = entry.findtext(f"{ATOM_NS}author/{ATOM_NS}name") or name

                # Thumbnail
                media_group = entry.find(f"{MEDIA_NS}group")
                thumbnail = None
                if media_group is not None:
                    thumb_el = media_group.find(f"{MEDIA_NS}thumbnail")
                    if thumb_el is not None:
                        thumbnail = thumb_el.get("url")
                description = ""
                if media_group is not None:
                    description = media_group.findtext(f"{MEDIA_NS}description") or ""

                published_at = None
                if published:
                    try:
                        published_at = datetime.fromisoformat(published.replace("Z", "+00:00"))
                    except ValueError:
                        pass

                url = f"https://www.youtube.com/watch?v={video_id}" if video_id else ""
                if not url or not title:
                    continue

                all_items.append({
                    "source": "youtube",
                    "external_id": video_id,
                    "url": url,
                    "title": title[:500],
                    "excerpt": description[:1000] or None,
                    "content_md": None,
                    "image_url": thumbnail,
                    "author": author,
                    "published_at": published_at,
                    "tags": ["youtube"] + tags,
                    "feed_metadata": {
                        "channel_id": channel_id,
                        "channel_name": name,
                    },
                })

        except Exception as e:
            logger.warning(f"YouTube RSS {name} failed: {e}")
            continue

    logger.info(f"YouTube: {len(all_items)} videos from {len(channels)} channels")
    return all_items
