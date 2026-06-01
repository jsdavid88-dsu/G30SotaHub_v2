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


# Gemma 가 brand 로 잘못 뽑는 일반 명사 — free_tags 오염 방지 (방어적 정규화).
_GENERIC_BRAND_STOPWORDS = {
    "model", "models", "diffusion", "transformer", "video", "image", "ai",
    "neural", "network", "lora", "adapter", "none", "null", "n/a", "na",
    "unknown", "general", "generic", "base", "sota", "vfx", "gan", "vae",
}


def normalize_brand(raw: object) -> str | None:
    """brand/family/base_model 값 정규화. 일반 명사·빈값·비정상 길이는 버림.

    Gemma 가 프롬프트 규칙대로 소문자/버전제거를 하지만, 방어적으로 한 번 더 거른다.
    night_batch (직접 경로) + admin score-update (worker 경로) 양쪽에서 공용.
    """
    if not raw or not isinstance(raw, str):
        return None
    b = raw.strip().lower()
    if not b or b in _GENERIC_BRAND_STOPWORDS:
        return None
    if len(b) < 2 or len(b) > 40:
        return None
    return b


def _call_gemma(system: str, user: str, temperature: float = 0.2, max_tokens: int = 4000) -> str:
    """Low-level Gemma call. Returns raw text response.

    Issue #6 (2026-06-01, 5090 실측): gemma4:26b 는 thinking 모델이라 reasoning 이
    completion 토큰을 전부 먹고 content_len=0 (JSON 0바이트)으로 반환 → batch 통째 유실
    (모드 B). 구조화 JSON 출력엔 chain-of-thought 가 불필요하므로 thinking 자체를 끈다.
    → `extra_body={"think": False}` (Ollama). completion 토큰 = 곧 JSON 토큰.
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
            extra_body={"think": False},  # Issue #6 P0: thinking off → content_len=0 구조적 차단
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
    """Extract JSON from Gemma response.

    Handles markdown code fences, trailing commas, and (most importantly)
    truncated arrays — when max_tokens cuts off mid-object, recover the
    completed objects up to the last full closing brace.

    Issue #8 fix: 중첩 안전망 — max_tokens 한계 도달해도 일부라도 살림.
    """
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.splitlines()
        lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        raw = "\n".join(lines)

    # 1차: 정상 파싱 + trailing comma 보정
    for start_char, end_char in [("[", "]"), ("{", "}")]:
        start = raw.find(start_char)
        end = raw.rfind(end_char)
        if start >= 0 and end > start:
            candidate = raw[start:end + 1]
            for attempt in (
                candidate,
                candidate
                    .replace(",\n]", "\n]").replace(",]", "]")
                    .replace(",\n}", "\n}").replace(",}", "}"),
            ):
                try:
                    return json.loads(attempt)
                except json.JSONDecodeError:
                    continue

    # 2차: Truncation recovery — array 가 mid-object 에서 잘렸을 때
    # 완전한 } 까지만 살려서 배열로 복구. 5개 중 3개라도 살리는 게 0개보다 낫음.
    arr_start = raw.find("[")
    if arr_start >= 0:
        chunk = raw[arr_start + 1:]
        last_close = chunk.rfind("}")
        if last_close >= 0:
            truncated = "[" + chunk[:last_close + 1] + "]"
            # 닫힘 직전 trailing comma 만 보정
            truncated = truncated.replace(",]", "]")
            try:
                result = json.loads(truncated)
                logger.warning(
                    f"[arca] truncation recovery: salvaged {len(result) if isinstance(result, list) else '?'} "
                    f"objects from raw_len={len(raw)} response"
                )
                return result
            except json.JSONDecodeError:
                pass

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

# 카테고리 목록을 하드코딩하지 않는다 — DB 가 source of truth.
# score_items(categories=...) 로 런타임 주입 → 신규 카테고리 추가 시 프롬프트 자동 반영.
# (없으면 fallback 문구만 — "best fit slug")

SCORE_SYSTEM_TEMPLATE = """너는 VFX SOTA Monitor의 분석 AI '아르카'.
이미지 생성 / 영상 생성 / 3D / 컴퓨터 비전 / VFX 전반의 새 모델·논문·도구를 분석한다.

## 사용 가능한 카테고리 (slug — 이름)
{category_list}

각 아이템에 대해 JSON 객체를 출력:
{{
  "id": <번호>,
  "relevancy_score": <1-10, VFX/영상제작 실무 관련성>,
  "priority": "P0"|"P1"|"P2"|"P3"|"WATCH",
  "category": "<위 목록 중 가장 맞는 slug. 애매하면 가장 가까운 것>",
  "reason": "<2문장 스코어 근거>",
  "verdict": "<한줄평 30-60자>",
  "tags": ["자유 태그 1-3개 (한국어, 예: 비디오 생성, 페이스 스왑)"],
  "brand": "<모델의 제품/시리즈 이름. 버전·접미사 떼고 소문자. 없으면 null>",
  "family": "<상위 모델 계열·아키텍처 이름. 소문자. 없으면 null>",
  "base_model": "<이게 파생/파인튜닝/로라라면 그 기반 모델 이름. 소문자. 없으면 null>",
  "modality": "<text-to-video|image-to-video|text-to-image|image-to-image|video-to-video|3d|other 중 하나 또는 null>"
}}

## brand/family/base_model 추출 규칙 (중요)
- 제목/내용에 등장하는 **고유 모델 제품명**을 정규화해서 뽑는다.
- 버전 숫자·접미사를 제거하고 핵심 시리즈명만 남긴다.
  예) "FooModel-2.3" → "foomodel", "BarVideo XL" → "barvideo", "Baz-v1.5-turbo" → "baz"
- 로라/어댑터/파인튜닝이면 그 **기반 모델**을 base_model 에 적는다.
  예) "XXX 스타일 로라 for YYYModel" → brand="xxx", base_model="yyymodel"
- 특정 브랜드를 미리 정해두지 말고, **텍스트에 실제로 나온 이름만** 사용한다.
- 일반 명사(diffusion, transformer, video, model 등)는 brand 가 아니다 → null.
- 확신 없으면 null. 추측하지 마라.

JSON 배열만 출력. 마크다운 금지.
"""


def _build_score_system(categories: list[dict] | None) -> str:
    """카테고리 목록을 프롬프트에 주입. categories=[{slug, name_ko}]."""
    if categories:
        lines = []
        for c in categories:
            slug = c.get("slug", "")
            name = c.get("name_ko") or c.get("name_en") or slug
            if slug:
                lines.append(f"- {slug} — {name}")
        category_list = "\n".join(lines) if lines else "(카테고리 미지정 — best fit slug)"
    else:
        category_list = "(카테고리 목록 없음 — 가장 적합한 영문 slug 자유 작성)"
    return SCORE_SYSTEM_TEMPLATE.format(category_list=category_list)


def score_items(items: list[dict], categories: list[dict] | None = None) -> list[dict]:
    """Score items with Gemma4. Returns list of scoring results.

    categories: [{slug, name_ko}] — DB 에서 주입. 하드코딩 대신 런타임 목록 사용.
    결과에 brand/family/base_model/modality 포함 (모델 계열 자동 태깅 — 검색·승격 연동).
    """
    if not items:
        return []

    system = _build_score_system(categories)

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
    raw = _call_gemma(system, "\n".join(parts), temperature=0.3, max_tokens=len(items) * 1800)
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


# ── 4. Wiki 초안 생성 (Karpathy 온톨로지 wiki tier) ───────────

WIKI_SYSTEM = """너는 VFX SOTA Monitor의 지식 정리 AI '아르카'.
주어진 모델/논문/도구를 연구실 위키 노드로 정리한다. 한국어 Markdown.

출력 JSON:
{
  "description": "50자 이내 핵심 한 줄 (무엇을 하는 모델인지)",
  "wiki_body": "## 개요\\n...\\n## 핵심 기여\\n- ...\\n## 한계·주의\\n- ...\\n## 관련\\n- [[관련 모델/계열/카테고리]]\\n",
  "wikilinks": ["연결할 모델·계열·카테고리 이름 1-6개 (소문자)"]
}

wiki_body 규칙:
- 한국어 Markdown. 섹션: 개요 / 핵심 기여 / 한계·주의 / 관련.
- 관련 모델·계열·카테고리·기반기술은 반드시 `[[이름]]` (Obsidian 위키링크) 형식으로 표기.
  예: "[[ltx]] 계열의 확장", "[[video_generation]] 분야".
- 주어진 제목/내용 기반으로만. 추측·창작 금지. 모르면 그 섹션 생략.
- 간결하게 (전체 200~500자).

JSON만 출력. 마크다운 코드펜스 금지."""


def generate_wiki_draft(item: dict) -> dict | None:
    """모델 1개의 wiki 초안 생성. {description, wiki_body, wikilinks} 또는 None.

    item: {title, source, abstract}. Ollama 미연결/파싱 실패 시 None (graceful).
    """
    user = (
        f"제목: {item.get('title', '?')}\n"
        f"소스: {item.get('source', '?')}\n"
        f"내용:\n{(item.get('abstract') or '')[:2000]}"
    )
    raw = _call_gemma(WIKI_SYSTEM, user, temperature=0.3, max_tokens=2500)
    parsed = _parse_json(raw)
    if not isinstance(parsed, dict):
        snippet = raw[:400].replace("\n", "\\n") if raw else "<empty>"
        logger.warning(f"Wiki 생성 파싱 실패: {snippet!r}")
        return None
    return parsed
