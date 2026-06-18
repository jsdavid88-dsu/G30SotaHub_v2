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

# 우선 추적 분야 (Dashboard 상단 고정 + LDR 자동발견 우선) — 상용 프론티어가 몰린 생성/편집.
# 이 분야 신모델(대부분 closed: Ideogram/Bernini/Nano Banana/Sora/Kling 등)은
# arxiv/github 에 논문/레포로 안 올라옴 → LDR 웹탐색·트렌딩 피드로만 잡힘.
# 따라서 LDR 질의 cap(ldr_nightbatch_max_queries) 안에 반드시 들어오도록 앞세운다.
# (프론트 Dashboard.tsx PRIORITY_SLUGS 와 동일 순서 유지.)
PRIORITY_CATEGORY_SLUGS: list[str] = [
    "image_generation", "image_edit", "video_generation", "video_edit",
]

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
