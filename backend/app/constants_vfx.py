"""Project-wide constants — single source of truth for shared values."""

# Canonical ordering of sources (lower = higher priority)
SOURCE_ORDER: dict[str, int] = {
    "arxiv": 0,
    "github": 1,
    "huggingface": 2,
    "reddit": 3,
    "x": 4,
}

SOURCES: tuple[str, ...] = tuple(SOURCE_ORDER.keys())

PRIORITIES: list[str] = ["P0", "P1", "P2", "P3", "WATCH"]

# Priority inference thresholds — ORDER MATTERS: evaluated first-match, strictest first.
# Using tuple list (not dict) to make ordering explicit and prevent accidental reorder.
PRIORITY_THRESHOLDS: list[tuple[str, dict]] = [
    ("P1", {"keyword_score": 5, "stars": 500}),
    ("P2", {"keyword_score": 3, "stars": 100}),
    ("P3", {"keyword_score": 1, "stars": 0}),
]

# Default fetch limits per source
FETCH_LIMITS: dict[str, dict] = {
    "arxiv": {"max_results": 150, "days_back": 2},
    "github": {"days_back": 7, "per_category": 20},
    "huggingface": {"days_back": 7, "per_category": 20},
    "reddit": {"days_back": 3, "per_category": 20},
}
