"""Keyword-based relevance scoring.

Fast, deterministic, no GPU. This is the primary scoring method on the main
Windows PC. The LLM scoring happens separately on the AI Cluster PC via the
ai_cluster_worker.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from app.sources.base import FetchedItem


def _make_pattern(keyword: str) -> re.Pattern[str]:
    """Compile a word-boundary regex for a keyword.

    Multi-word keywords match as phrases (whitespace-normalized).
    Non-ASCII (Korean, CJK) characters skip \\b since \\b is ASCII-only.
    """
    kw = keyword.strip()
    if not kw:
        return re.compile(r"(?!)")

    escaped = re.escape(kw)
    is_ascii = kw.isascii()
    if is_ascii and re.match(r"^\w", kw) and re.search(r"\w$", kw):
        pattern = rf"\b{escaped}\b"
    else:
        pattern = escaped
    return re.compile(pattern, re.IGNORECASE)


@dataclass
class ScoreResult:
    keyword_score: int
    matched_keywords: list[str]
    matched_categories: list[str]  # category slugs this item matched


def _text_for_matching(item: FetchedItem) -> str:
    parts = [item.title or ""]
    if item.abstract:
        parts.append(item.abstract)
    # Include metadata strings (GitHub topics, HF tags, subreddit names)
    md = item.metadata or {}
    for key in ("topics", "tags", "categories", "subreddit"):
        val = md.get(key)
        if isinstance(val, list):
            parts.append(" ".join(str(v) for v in val))
        elif isinstance(val, str):
            parts.append(val)
    return " ".join(parts).lower()


def score_item_for_category(
    item: FetchedItem,
    keywords: list[str],
) -> tuple[int, list[str]]:
    """Return (score, matched_keywords) for one item vs one category."""
    if not keywords:
        return 0, []

    text = _text_for_matching(item)
    matched: list[str] = []

    for kw in keywords:
        pat = _make_pattern(kw)
        if pat.search(text):
            matched.append(kw)

    return len(matched), matched


def score_items(
    items: list[FetchedItem],
    categories_with_keywords: dict[str, list[str]],
    min_score: int = 1,
) -> dict[str, ScoreResult]:
    """Score a list of items against all categories.

    Args:
        items: items to score
        categories_with_keywords: {category_slug: [keyword, ...]}
        min_score: minimum keyword match count to associate an item with a category

    Returns:
        {external_id: ScoreResult} for items that matched at least one category
    """
    results: dict[str, ScoreResult] = {}

    for item in items:
        total_score = 0
        all_matched: list[str] = []
        cats: list[str] = []

        for slug, keywords in categories_with_keywords.items():
            s, m = score_item_for_category(item, keywords)
            if s >= min_score:
                cats.append(slug)
                total_score = max(total_score, s)
                all_matched.extend(m)

        if cats:
            key = f"{item.source}:{item.external_id}"
            results[key] = ScoreResult(
                keyword_score=total_score,
                matched_keywords=sorted(set(all_matched)),
                matched_categories=cats,
            )

    return results


def infer_priority(keyword_score: int, metadata: dict | None = None) -> str:
    """Rough priority from keyword score (LLM later overrides).

    Real priority assignment happens in Phase 3 via Gemma 4.
    This is a fallback so items visible on the dashboard before LLM runs.
    """
    from app.constants_vfx import PRIORITY_THRESHOLDS

    md = metadata or {}
    stars = md.get("stars", 0) or 0

    for priority, thresh in PRIORITY_THRESHOLDS:
        if keyword_score >= thresh["keyword_score"] or stars >= thresh["stars"]:
            return priority
    return "WATCH"
