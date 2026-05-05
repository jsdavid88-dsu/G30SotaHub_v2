"""Gemma 4 prompts for VFX SOTA relevance scoring.

Persona loaded from soul.md at import time.
"""
from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).parent

# Load persona from soul.md (editable by user)
_soul_path = HERE / "soul.md"
try:
    SOUL = _soul_path.read_text(encoding="utf-8")
except FileNotFoundError:
    SOUL = ""


CATEGORIES_INFO = """
10개 VFX 카테고리 slug:
1. video_matting — 비디오 매팅 (alpha matte, trimap-free, 모발 경계)
2. video_removal — 비디오 리무벌/인페인팅 (객체 제거, VOID, ProPainter)
3. face_parsing — 페이스 파싱 (SegFace, SAM, 얼굴 세그멘테이션)
4. point_tracking — 포인트 트래킹 (TAP, CoTracker, TAPIR)
5. head_swap — 헤드/페이스 스왑 (DFL 대체, Wan-Animate, face reenactment)
6. 3dgs — 3D Gaussian Splatting (3DGS, NeRF, Nerfstudio, 뷰 합성)
7. beauty — 뷰티/피부 보정 (face retouching, AuthFace)
8. korean_text_edit — 한글 텍스트 편집 (scene text editing, STELLAR)
9. ref_search — Ref 영상 검색 (CLIP, Qwen-VL-Embedding)
10. qc_program — QC (video quality, IQA, DaVinci)
""".strip()


OUTPUT_SCHEMA = """
각 아이템에 대해 정확히 아래 JSON 객체를 출력한다:

{
  "id": <프롬프트 내 아이템 번호>,
  "relevancy_score": <1-10 정수>,
  "priority": "P0" | "P1" | "P2" | "P3" | "WATCH",
  "category": "<10개 slug 중 하나>",
  "reason": "<짧은 스코어 근거, 2문장 이내, 카드 목록 미리보기용>",
  "verdict": "<아르카의 한줄평, 30-60자, 정곡을 찌르는 한 문장>",
  "practical_value": "<실무 가치, 우리 VFX 파이프라인 어디에 쓸 수 있는지 2-4문장>",
  "lineage_thought": "<기술 계보, 무엇을 계승/확장했는지 2-3문장>",
  "translation": "<초록을 자연스러운 한국어로 재구성 3-5문장. 논문이 아니면 핵심 요약>",
  "warning": "<라이선스/하드웨어/기타 숨은 함정. 없으면 빈 문자열>"
}
""".strip()


SYSTEM_PROMPT = f"""{SOUL}

---

{CATEGORIES_INFO}

---

{OUTPUT_SCHEMA}

---

# 절대 규칙

- 출력은 **JSON 배열만**. 설명/주석/마크다운 코드 블록 금지.
- 배열 첫 글자는 `[`, 마지막 글자는 `]`.
- 각 객체는 한 줄에 써도 되고 여러 줄에 나눠써도 되지만 **JSON 문법**을 지켜라.
- 아이템 순서는 입력과 동일하게 유지한다.
- category는 반드시 10개 slug 중 **하나만** 선택 (여러 개에 걸쳐도 가장 중심인 것).
- 입력에 abstract/본문이 없으면 제목만 보고 추정해도 된다. 추정이라면 warning에 명시.
- JSON 값 안에서 따옴표는 `\\"`로 이스케이프한다.
"""


def build_user_prompt(items: list[dict]) -> str:
    """Build the batched user message containing items to score."""
    parts = [f"# 아르카, 아래 {len(items)}개 아이템을 분석해줘.\n"]
    for i, item in enumerate(items, 1):
        parts.append(f"## 아이템 {i}")
        parts.append(f"- 소스: {item.get('source', '?')}")
        parts.append(f"- 제목: {item.get('title', '(제목 없음)')}")
        if item.get("category_slugs"):
            parts.append(f"- 키워드 매칭: {', '.join(item['category_slugs'])}")
        abstract = (item.get("abstract") or "").strip()
        if abstract:
            parts.append(f"- 내용:\n{abstract[:1200]}")
        parts.append("")
    parts.append("위 아이템 순서대로 JSON 배열 하나만 출력해라.")
    return "\n".join(parts)


def _infer_priority_from_score(score: int) -> str:
    if score >= 9:
        return "P0"
    if score >= 7:
        return "P1"
    if score >= 5:
        return "P2"
    if score >= 3:
        return "P3"
    return "WATCH"


def parse_response(raw: str, items: list[dict]) -> list[dict]:
    """Parse Gemma's JSON array response into score updates.

    Returns a list of dicts matching backend ScoreUpdate + analysis payload.
    """
    raw = (raw or "").strip()

    # Strip markdown fences if present
    if raw.startswith("```"):
        lines = raw.splitlines()
        if len(lines) >= 2:
            lines = lines[1:]
            if lines and lines[-1].strip().startswith("```"):
                lines = lines[:-1]
            raw = "\n".join(lines)

    start = raw.find("[")
    end = raw.rfind("]")
    if start == -1 or end == -1 or end <= start:
        return []

    json_text = raw[start : end + 1]

    try:
        parsed = json.loads(json_text)
    except json.JSONDecodeError:
        fixed = json_text.replace(",\n]", "\n]").replace(",]", "]")
        try:
            parsed = json.loads(fixed)
        except json.JSONDecodeError:
            return []

    if not isinstance(parsed, list):
        return []

    updates: list[dict] = []
    for idx, entry in enumerate(parsed):
        if not isinstance(entry, dict):
            continue

        prompt_id = entry.get("id")
        real_item = None
        if isinstance(prompt_id, int) and 1 <= prompt_id <= len(items):
            real_item = items[prompt_id - 1]
        elif idx < len(items):
            real_item = items[idx]
        if not real_item:
            continue

        # Score 0..10
        score = entry.get("relevancy_score") or entry.get("score") or 0
        try:
            score = int(score)
        except (TypeError, ValueError):
            score = 0
        score = max(0, min(10, score))

        # Priority
        priority = entry.get("priority") or ""
        if priority not in ("P0", "P1", "P2", "P3", "WATCH"):
            priority = _infer_priority_from_score(score)

        # Short reason (goes into llm_reason text column)
        reason = str(entry.get("reason") or "").strip()[:500]
        category = entry.get("category") or ""
        if category:
            reason = f"[{category}] {reason}" if reason else f"[{category}]"

        # Extended analysis (goes into item_metadata.arca)
        analysis = {
            "verdict": str(entry.get("verdict") or "").strip()[:300],
            "practical_value": str(entry.get("practical_value") or "").strip()[:2000],
            "lineage_thought": str(entry.get("lineage_thought") or "").strip()[:1500],
            "translation": str(entry.get("translation") or "").strip()[:3000],
            "warning": str(entry.get("warning") or "").strip()[:500],
            "category": category,
        }

        updates.append(
            {
                "id": real_item["id"],
                "llm_score": score,
                "llm_reason": reason,
                "priority": priority,
                "analysis": analysis,
            }
        )

    return updates
