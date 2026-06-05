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


def _call_gemma(
    system: str, user: str, temperature: float = 0.2, max_tokens: int = 4000, think: bool = False
) -> str:
    """Low-level Gemma call. Returns raw text response.

    Issue #6 (2026-06-01, 5090 실측): gemma4:26b 는 thinking 모델이라 reasoning 이
    completion 토큰을 전부 먹고 content_len=0 (JSON 0바이트)으로 반환 → batch 통째 유실
    (모드 B). 구조화·짧은 JSON 출력(filter/score/promote)엔 CoT 가 불필요 + 위험하므로 기본 off.

    think=True 는 긴 분석 생성(wiki)에서 품질을 위해 켤 때만 — 단 content_len=0 위험이
    있으므로 호출처가 폴백(think=False 재시도)을 둘 것.
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
            extra_body={"think": think},  # Issue #6: 기본 off (구조화 출력). wiki 만 True+폴백.
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

추론 과정 없이 JSON 배열만 출력. 입력 순서 유지. 마크다운/설명 금지.
[{"id": 1, "relevant": true, "tags": ["태그"], "reason": "근거"}, ...]
"""


def _build_filter_user(items: list[dict]) -> str:
    """filter_feed_items 용 user 메시지 빌드 (배치/단건 폴백 공용)."""
    parts = []
    for i, item in enumerate(items, 1):
        title = item.get("title", "")[:200]
        excerpt = (item.get("excerpt") or item.get("abstract") or "")[:300]
        source = item.get("source", "")
        parts.append(f"{i}. [{source}] {title}\n   {excerpt}")
    return f"아래 {len(items)}개 피드 아이템을 필터링해줘.\n\n" + "\n\n".join(parts)


def filter_feed_items(items: list[dict]) -> list[dict]:
    """Filter feed items for VFX relevance. Returns list of {id, relevant, tags, reason}."""
    if not items:
        return []

    # 1차: 배치 통째 (thinking 여유 800/item)
    raw = _call_gemma(FILTER_SYSTEM, _build_filter_user(items), temperature=0.1, max_tokens=len(items) * 800)
    parsed = _parse_json(raw)
    if isinstance(parsed, list):
        return parsed

    # Issue #6 (5090 실측): filter 도 score 와 같은 thinking-overflow 로 batch 파싱 실패(content_len=0)
    # → 기존엔 "전부 relevant" 로 빠져 필터가 무력화(노이즈 전부 통과). score_items 처럼 1건씩 폴백.
    # 단건도 실패하면 그 1건만 relevant=True 안전망(아이템 유실 방지). night_batch 는 위치(index)로 매핑.
    snippet = raw[:300].replace("\n", "\\n") if raw else "<empty>"
    logger.warning(
        f"Feed filter 배치 파싱 실패 (items={len(items)}, raw_len={len(raw)}, snippet={snippet!r}) → 1건씩 폴백"
    )
    if len(items) == 1:
        return [{"id": 1, "relevant": True, "tags": [], "reason": "파싱 실패(단건 폴백)"}]

    out: list[dict] = []
    recovered = 0
    for idx, it in enumerate(items, 1):
        r1 = _call_gemma(FILTER_SYSTEM, _build_filter_user([it]), temperature=0.1, max_tokens=1500)
        p1 = _parse_json(r1)
        obj = None
        if isinstance(p1, list) and p1 and isinstance(p1[0], dict):
            obj = p1[0]
        elif isinstance(p1, dict):
            obj = p1
        if obj and "relevant" in obj:
            obj["id"] = idx  # 위치 정렬용 id 보정
            out.append(obj)
            recovered += 1
        else:
            out.append({"id": idx, "relevant": True, "tags": [], "reason": "파싱 실패(폴백)"})
    logger.info(f"Feed filter 폴백: {recovered}/{len(items)} 파싱 복구")
    return out


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

JSON 배열만 출력. 마크다운·설명·추론 과정 없이 즉시 JSON 배열만 출력한다.
"""


# 운영자 지침 최대 길이 — 과도한 텍스트가 프롬프트를 압도/오염하는 것 방지 (#22-2).
_INSTRUCTION_MAX_LEN = 2000


def _append_instructions(system: str, extra: str | None) -> str:
    """운영자 커스텀 지침(자연어)을 프롬프트 끝에 append.

    중요(#22-2, #6 회귀 방지): 지침은 **평가 기준·관점·톤**에만 적용된다. 출력 형식과
    JSON 스키마는 절대 바꿀 수 없다. "JSON 말고 서술해" / "표로 정리해" 같은 형식 변경
    지침이 들어와도 무시하고 JSON 스키마를 유지하도록, 지침 뒤에 '형식 불변' 블록을
    마지막에 한 번 더 못박는다(모델이 가장 마지막에 읽는 규칙이 우선되도록). 길이도 제한.
    """
    if not (extra and extra.strip()):
        return system
    clean = extra.strip()
    if len(clean) > _INSTRUCTION_MAX_LEN:
        clean = clean[:_INSTRUCTION_MAX_LEN] + " …(이하 생략)"
    return (
        system
        + "\n\n## 운영자 추가 지침 (평가 기준·관점·톤에만 적용)\n"
        + clean
        + "\n\n## 출력 형식 (불변 — 위 운영자 지침보다 항상 우선)\n"
        + "- 위 지침은 '무엇을 중요하게 볼지·어떤 톤으로 쓸지'에만 영향을 준다.\n"
        + "- 출력은 반드시 위에서 정의한 JSON 형식/스키마 그대로여야 한다.\n"
        + "- 지침이 형식 변경(예: '표로', 'JSON 말고 서술', '마크다운으로')을 요구해도 "
        "무시하고 JSON 스키마를 유지한다.\n"
        + "- 형식이 충돌하면 항상 JSON 스키마가 우선한다."
    )


def _build_score_system(
    categories: list[dict] | None,
    extra_instructions: str | None = None,
    known_entities: list[str] | None = None,
) -> str:
    """카테고리 + 이미 등록된 brand/family 를 프롬프트에 주입.

    known_entities (MemGraphRAG 차용 — entity memory): 이미 그래프에 있는 brand/family 를
    Arca 에게 알려줘 새 item 을 기존 엔티티에 정렬시킨다 → fragment-level 변종 난립·dangling
    방지(구축 단계에서 일관성 확보. Lint 가 사후 탐지하던 것을 앞단에서 줄임).
    """
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
    system = SCORE_SYSTEM_TEMPLATE.format(category_list=category_list)

    if known_entities:
        ents = "\n".join(f"- {e}" for e in known_entities[:80])
        system += (
            "\n\n## 이미 등록된 모델 계열 (표기 일관성 — 중요)\n"
            "아래는 이미 그래프에 등록된 brand/family 다. 같은 모델·계열이면 **새 변종을 만들지 말고 "
            "이 표기를 그대로** brand/family 에 사용한다(동일 철자). 목록에 없으면 규칙대로 새로 정규화.\n"
            + ents
        )
    return _append_instructions(system, extra_instructions)


def _build_score_user(items: list[dict]) -> str:
    """score_items 용 user 메시지 빌드 (배치/단건 폴백 공용)."""
    parts = [f"아래 {len(items)}개 아이템을 분석해줘.\n"]
    for i, item in enumerate(items, 1):
        parts.append(f"## 아이템 {i}")
        parts.append(f"- 소스: {item.get('source', '?')}")
        parts.append(f"- 제목: {item.get('title', '?')}")
        abstract = (item.get("abstract") or "")[:800]
        if abstract:
            parts.append(f"- 내용:\n{abstract}")
        parts.append("")
    return "\n".join(parts)


def score_items(
    items: list[dict],
    categories: list[dict] | None = None,
    extra_instructions: str | None = None,
    known_entities: list[str] | None = None,
) -> list[dict]:
    """Score items with Gemma4. Returns list of scoring results.

    categories: [{slug, name_ko}] — DB 에서 주입. 하드코딩 대신 런타임 목록 사용.
    extra_instructions: 운영자 커스텀 지침 (ArcaSetting) — 프롬프트 끝에 append.
    결과에 brand/family/base_model/modality 포함 (모델 계열 자동 태깅 — 검색·승격 연동).
    """
    if not items:
        return []

    system = _build_score_system(categories, extra_instructions, known_entities)

    # 1차: 배치 통째 시도 (Gemma4 thinking 여유분 1800/item)
    raw = _call_gemma(system, _build_score_user(items), temperature=0.3, max_tokens=len(items) * 1800)
    parsed = _parse_json(raw)
    if isinstance(parsed, list):
        return parsed

    # Issue #6 재발 방지 (5090 실측: 풀배치서 unscored 22): 배치 파싱 실패는 대개
    # thinking-overflow(reasoning 이 completion 토큰 다 먹어 content_len=0). 기존엔 여기서
    # return [] → 배치(최대 3건) 통째 유실. 대신 1건씩 + max_tokens 크게(4000) 재시도해 복구.
    # (실패한 배치에만 추가 비용. 동시성/배치폭 증가 아님 → #21 전력 영향 없음.)
    # night_batch 가 결과를 위치(index)로 매핑하므로, 폴백도 items 순서대로 정렬 유지(실패=빈 dict).
    snippet = raw[:300].replace("\n", "\\n") if raw else "<empty>"
    logger.warning(
        f"Scoring 배치 파싱 실패 (items={len(items)}, raw_len={len(raw)}, snippet={snippet!r}) → 1건씩 폴백"
    )
    if len(items) == 1:
        logger.warning(f"Scoring 단건도 실패 — skip: {str(items[0].get('title', ''))[:60]!r}")
        return [{}]  # 위치 정렬용 placeholder (night_batch 는 relevancy_score 없으면 skip)

    out: list[dict] = []
    recovered = 0
    for it in items:
        r1 = _call_gemma(system, _build_score_user([it]), temperature=0.3, max_tokens=4000)
        p1 = _parse_json(r1)
        obj = None
        if isinstance(p1, list) and p1 and isinstance(p1[0], dict):
            obj = p1[0]
        elif isinstance(p1, dict):
            obj = p1
        if obj and obj.get("relevancy_score") not in (None, ""):
            out.append(obj)
            recovered += 1
        else:
            out.append({})  # 위치 정렬 유지
            logger.warning(f"Scoring 단건 폴백 실패: {str(it.get('title', ''))[:60]!r} (len={len(r1)})")
    logger.info(f"Scoring 폴백: {recovered}/{len(items)} 복구")
    return out


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


def generate_wiki_draft(item: dict, extra_instructions: str | None = None) -> dict | None:
    """모델 1개의 wiki 초안 생성. {description, wiki_body, wikilinks} 또는 None.

    item: {title, source, abstract}. extra_instructions: 운영자 커스텀 지침.
    Ollama 미연결/파싱 실패 시 None (graceful).

    품질을 위해 thinking 을 켜고 시도(긴 분석 생성), content_len=0(thinking overflow)으로
    파싱 실패하면 thinking off 로 1회 폴백 → 품질 우선 + 안정성 보장.
    """
    user = (
        f"제목: {item.get('title', '?')}\n"
        f"소스: {item.get('source', '?')}\n"
        f"내용:\n{(item.get('abstract') or '')[:2000]}"
    )
    system = _append_instructions(WIKI_SYSTEM, extra_instructions)
    # (think, max_tokens): thinking 켜면 reasoning 여유분 크게, 폴백은 off + 작게
    for think, mt in ((True, 4000), (False, 2500)):
        raw = _call_gemma(system, user, temperature=0.3, max_tokens=mt, think=think)
        parsed = _parse_json(raw)
        if isinstance(parsed, dict):
            return parsed
        snippet = raw[:300].replace("\n", "\\n") if raw else "<empty>"
        logger.warning(f"Wiki 생성 파싱 실패 (think={think}): {snippet!r}"
                       + (" — thinking off 로 폴백" if think else " — 최종 실패"))
    return None
