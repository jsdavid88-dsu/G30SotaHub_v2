"""Arca Brain — Gemma4 LLM interface for all AI-powered decisions.

Single module that handles every Gemma4 call in the system:
1. Feed filtering ("VFX 관련?")
2. Item scoring (llm_score, priority, verdict, analysis)
3. Free tag assignment
4. Category promotion suggestions
5. Submission analysis

All functions talk to Ollama via OpenAI-compatible API.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from openai import OpenAI
from openai._exceptions import OpenAIError

from app.config import settings

logger = logging.getLogger(__name__)

# Ollama config — reads from .env or defaults
OLLAMA_BASE_URL = "http://localhost:11434/v1"
OLLAMA_MODEL = "gemma4:26b"
OLLAMA_TIMEOUT = 300


def _get_client() -> OpenAI:
    return OpenAI(
        base_url=OLLAMA_BASE_URL,
        api_key="ollama",
        timeout=OLLAMA_TIMEOUT,
    )


def _call_gemma(system: str, user: str, temperature: float = 0.2, max_tokens: int = 4000) -> str:
    """Low-level Gemma call. Returns raw text response.

    Issue #6 fix (2026-05-07): completion_tokens / reasoning 길이 로그 추가.
    Gemma4 26B 가 thinking 모델이라 reasoning tokens 부터 소비 → max_tokens 부족 시 mid-stream truncation.
    """
    try:
        client = _get_client()
        resp = client.chat.completions.create(
            model=OLLAMA_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        if not resp.choices:
            logger.warning(f"Gemma: no choices in response (max_tokens={max_tokens})")
            return ""
        content = resp.choices[0].message.content or ""
        # Issue #6 디버그: 사용 토큰 + content 길이 로그
        usage = getattr(resp, "usage", None)
        if usage:
            logger.info(
                f"Gemma usage: prompt={usage.prompt_tokens}, "
                f"completion={usage.completion_tokens}, "
                f"max_tokens={max_tokens}, content_len={len(content)}"
            )
            if usage.completion_tokens >= max_tokens - 50:
                logger.warning(
                    f"Gemma: completion_tokens={usage.completion_tokens} 가 max_tokens={max_tokens} "
                    f"한계에 근접 — 응답 잘렸을 가능성"
                )
        return content
    except OpenAIError as e:
        logger.error(f"Gemma call failed: {e}")
        return ""


def _parse_json(raw: str) -> Any:
    """Extract JSON from Gemma response (handles markdown fences)."""
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.splitlines()
        lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        raw = "\n".join(lines)

    # Find JSON array or object
    for start_char, end_char in [("[", "]"), ("{", "}")]:
        start = raw.find(start_char)
        end = raw.rfind(end_char)
        if start >= 0 and end > start:
            try:
                return json.loads(raw[start:end + 1])
            except json.JSONDecodeError:
                # Try fixing trailing comma
                fixed = raw[start:end + 1].replace(",\n]", "\n]").replace(",]", "]")
                try:
                    return json.loads(fixed)
                except json.JSONDecodeError:
                    continue
    return None


# ── 1. Feed Filtering ────────────────────────────────────────

FILTER_SYSTEM = """너는 VFX SOTA Monitor의 필터링 AI '아르카'.
피드 아이템 목록을 받아서 VFX/AI/영상 제작과 관련된 것만 남긴다.

각 아이템에 대해:
- relevant: true/false (VFX, 영상 AI, 3D, 컴퓨터 비전, ComfyUI, 영상 편집 관련이면 true)
- tags: 관련 태그 1-3개 (한국어, 예: "비디오 생성", "3D 가우시안", "페이스 스왑")
- reason: 판단 근거 한 줄

JSON 배열만 출력. 입력 순서 유지. 마크다운/설명 금지.
[{"id": 1, "relevant": true, "tags": ["태그"], "reason": "근거"}, ...]
"""


def filter_feed_items(items: list[dict]) -> list[dict]:
    """Filter feed items for VFX relevance. Returns list of {id, relevant, tags, reason}."""
    if not items:
        return []

    parts = []
    for i, item in enumerate(items, 1):
        title = item.get("title", "")[:200]
        excerpt = (item.get("excerpt") or item.get("abstract") or "")[:300]
        source = item.get("source", "")
        parts.append(f"{i}. [{source}] {title}\n   {excerpt}")

    user_msg = f"아래 {len(items)}개 피드 아이템을 필터링해줘.\n\n" + "\n\n".join(parts)

    # Issue #6 fix: 200/item → 800/item (thinking 여유)
    raw = _call_gemma(FILTER_SYSTEM, user_msg, temperature=0.1, max_tokens=len(items) * 800)
    parsed = _parse_json(raw)

    if not isinstance(parsed, list):
        snippet = raw[:500].replace("\n", "\\n") if raw else "<empty>"
        logger.warning(
            f"Feed filter: failed to parse (items={len(items)}, raw_len={len(raw)}, snippet={snippet!r})"
        )
        # Fallback: mark all as relevant
        return [{"id": i + 1, "relevant": True, "tags": [], "reason": "파싱 실패"} for i in range(len(items))]

    return parsed


# ── 2. Item Scoring ──────────────────────────────────────────

SCORE_SYSTEM = """너는 VFX SOTA Monitor의 분석 AI '아르카'.

10개 VFX 카테고리:
1. video_matting 2. video_removal 3. face_parsing 4. point_tracking
5. head_swap 6. 3dgs 7. beauty 8. korean_text_edit 9. ref_search 10. qc_program

각 아이템에 대해 JSON 객체를 출력:
{
  "id": <번호>,
  "relevancy_score": <1-10>,
  "priority": "P0"|"P1"|"P2"|"P3"|"WATCH",
  "category": "<slug>",
  "reason": "<2문장 스코어 근거>",
  "verdict": "<한줄평 30-60자>",
  "tags": ["자유 태그 1-3개"]
}

JSON 배열만 출력. 마크다운 금지.
"""


def score_items(items: list[dict]) -> list[dict]:
    """Score items with Gemma4. Returns list of scoring results."""
    if not items:
        return []

    parts = [f"아래 {len(items)}개 아이템을 분석해줘.\n"]
    for i, item in enumerate(items, 1):
        parts.append(f"## 아이템 {i}")
        parts.append(f"- 소스: {item.get('source', '?')}")
        parts.append(f"- 제목: {item.get('title', '?')}")
        abstract = (item.get("abstract") or "")[:800]
        if abstract:
            parts.append(f"- 내용:\n{abstract}")
        parts.append("")

    # Issue #6 fix: 500/item → 1800/item (Gemma4 26B thinking 모델 reasoning 여유)
    raw = _call_gemma(SCORE_SYSTEM, "\n".join(parts), temperature=0.3, max_tokens=len(items) * 1800)
    parsed = _parse_json(raw)

    if not isinstance(parsed, list):
        # Issue #6 fix: 디버그용 — raw 응답 첫 800자 + 길이 로그
        snippet = raw[:800].replace("\n", "\\n") if raw else "<empty>"
        logger.warning(
            f"Scoring: failed to parse response (items={len(items)}, raw_len={len(raw)}, "
            f"raw_snippet={snippet!r})"
        )
        return []

    return parsed


# ── 3. Category Promotion Suggestion ─────────────────────────

PROMOTE_SYSTEM = """너는 VFX SOTA Monitor의 카테고리 설계 AI '아르카'.

현재 10개 카테고리가 있다. 새로운 태그가 반복 등장하면 카테고리 승격을 제안한다.

입력: 태그명 + 해당 아이템 수 + 샘플 아이템 제목
출력: JSON 하나
{
  "should_promote": true/false,
  "suggested_name_ko": "한국어 카테고리명",
  "suggested_name_en": "English Category Name",
  "suggested_keywords": ["검색 키워드 5-10개"],
  "reason": "승격 이유 2-3문장. 기존 카테고리와 차별점."
}

JSON만 출력.
"""


def suggest_category_promotion(tag: str, item_count: int, sample_titles: list[str]) -> dict | None:
    """Ask Gemma4 to suggest a category promotion."""
    user_msg = f"""태그: "{tag}"
아이템 수: {item_count}
샘플 제목:
""" + "\n".join(f"- {t}" for t in sample_titles[:10])

    raw = _call_gemma(PROMOTE_SYSTEM, user_msg, temperature=0.2, max_tokens=1000)
    parsed = _parse_json(raw)

    if not isinstance(parsed, dict):
        return None
    return parsed
