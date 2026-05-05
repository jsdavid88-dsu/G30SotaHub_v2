"""Arca Researcher Agent — Gemma 4 + Crawl4AI full agent with tool calling.

Gemma 4 decides what to search, reads results, decides if more research
is needed, and produces a structured enrichment report.

Usage:
    python researcher.py --item-id 33
    python researcher.py --item-id 33 --max-turns 3
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
from pathlib import Path

import httpx
import yaml

os.environ.setdefault("PYTHONIOENCODING", "utf-8")

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
from openai import OpenAI

CONFIG_PATH = Path(__file__).parent / "config.yaml"

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


# ── Config ───────────────────────────────────────────────────────

def load_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        cfg = yaml.safe_load(f) or {}
    cfg.setdefault("OLLAMA_BASE_URL", "http://localhost:11434/v1")
    cfg.setdefault("OLLAMA_MODEL", "gemma4:26b")
    cfg.setdefault("OLLAMA_TIMEOUT", 600)
    return cfg


# ── Tools (Crawl4AI) ────────────────────────────────────────────

async def tool_web_search(query: str, limit: int = 3) -> str:
    """Google search → return titles + URLs."""
    from urllib.parse import quote_plus
    search_url = f"https://www.google.com/search?q={quote_plus(query)}&num={limit * 2}"

    try:
        browser_cfg = BrowserConfig(headless=True, verbose=False)
        run_cfg = CrawlerRunConfig(word_count_threshold=10, verbose=False)
        async with AsyncWebCrawler(config=browser_cfg) as crawler:
            result = await crawler.arun(url=search_url, config=run_cfg)
            if not result.success:
                return f"[검색 실패: {result.error_message}]"

            links = []
            for link in (result.links or {}).get("external", []):
                href = link.get("href", "")
                text = link.get("text", "")
                if href and "google.com" not in href and text and len(text) > 5:
                    links.append(f"- {text[:80]}\n  {href}")
                if len(links) >= limit:
                    break

            return "\n".join(links) if links else "[결과 없음]"
    except Exception as e:
        return f"[검색 에러: {e}]"


async def tool_crawl_page(url: str) -> str:
    """Crawl a URL and return markdown content (max 2500 chars)."""
    try:
        browser_cfg = BrowserConfig(headless=True, verbose=False)
        run_cfg = CrawlerRunConfig(
            word_count_threshold=30,
            excluded_tags=["nav", "footer", "header", "aside"],
            verbose=False,
        )
        async with AsyncWebCrawler(config=browser_cfg) as crawler:
            result = await crawler.arun(url=url, config=run_cfg)
            if result.success:
                md = (result.markdown or "")[:2500]
                title = (result.metadata or {}).get("title", "")
                return f"제목: {title}\n\n{md}"
            return f"[크롤 실패: {result.error_message}]"
    except Exception as e:
        return f"[크롤 에러: {e}]"


# Tool definitions for Gemma
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Google 웹 검색. 논문, GitHub 레포, HuggingFace 모델, 튜토리얼 등을 찾을 때 사용.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "검색어"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "crawl_page",
            "description": "특정 URL의 웹페이지를 크롤해서 내용을 읽는다. GitHub README, 논문 페이지, 프로젝트 사이트 등.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "크롤할 URL"},
                },
                "required": ["url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finish",
            "description": "조사 완료. 최종 리포트를 JSON으로 제출한다.",
            "parameters": {
                "type": "object",
                "properties": {
                    "report": {
                        "type": "object",
                        "description": "최종 리서치 리포트 JSON",
                        "properties": {
                            "github_repos": {
                                "type": "array",
                                "items": {"type": "object"},
                                "description": "발견한 GitHub 레포 [{name, url, stars, license}]",
                            },
                            "hf_models": {
                                "type": "array",
                                "items": {"type": "object"},
                                "description": "발견한 HuggingFace 모델 [{name, url}]",
                            },
                            "project_page": {"type": "string"},
                            "demo_available": {"type": "boolean"},
                            "comfyui_node": {"type": "string"},
                            "key_findings": {"type": "string", "description": "실무 관점 핵심 발견 3-5줄 한국어"},
                            "enriched_abstract": {"type": "string", "description": "보강된 한국어 요약 5-8줄"},
                        },
                    },
                },
                "required": ["report"],
            },
        },
    },
]

# Tool executors
TOOL_EXECUTORS = {
    "web_search": lambda args: tool_web_search(args.get("query", ""), limit=3),
    "crawl_page": lambda args: tool_crawl_page(args.get("url", "")),
}


# ── System prompt ────────────────────────────────────────────────

AGENT_SYSTEM = """너는 '아르카(Arca)' — VFX SOTA Monitor의 연구 에이전트.
주어진 논문/프로젝트에 대해 도구를 사용해 능동적으로 웹을 조사한다.

# 도구
- web_search: Google 검색. 쿼리를 잘 짜서 원하는 정보를 찾아라.
- crawl_page: URL을 크롤해서 내용을 읽는다.
- finish: 조사 완료 후 최종 리포트 JSON 제출.

# 조사 전략
1. 먼저 "{프로젝트명} github" 검색해서 공식 레포를 찾아라
2. GitHub 레포가 있으면 crawl해서 stars, 라이선스, README 핵심 확인
3. "{프로젝트명} huggingface" 검색해서 모델/데모 확인
4. 필요하면 프로젝트 공식 페이지, ComfyUI 노드, 벤치마크도 추가 검색
5. 충분히 조사했으면 finish로 리포트 제출

# 규칙
- 매 턴마다 도구를 하나 이상 호출해라. 생각만 하지 말고 행동해라.
- 불필요한 검색은 하지 마라. 3-5턴 안에 finish해라.
- finish의 report는 반드시 완전한 JSON 객체여야 한다.
"""


# ── Agent loop ───────────────────────────────────────────────────

async def execute_tool(name: str, args: dict) -> str:
    """Execute a tool and return the result string."""
    executor = TOOL_EXECUTORS.get(name)
    if not executor:
        return f"[알 수 없는 도구: {name}]"
    result = executor(args)
    if asyncio.iscoroutine(result):
        result = await result
    return str(result)[:3000]


async def run_agent(item: dict, cfg: dict, max_turns: int = 5) -> dict:
    """Run the Arca research agent loop."""
    title = item.get("title", "Unknown")
    logger.info(f"=== Arca Agent: {title} ===")

    client = OpenAI(
        base_url=cfg["OLLAMA_BASE_URL"],
        api_key="ollama",
        timeout=cfg["OLLAMA_TIMEOUT"],
    )

    # Initial user message
    abstract = (item.get("abstract") or "").strip()
    user_msg = f"""아래 아이템을 조사해줘.

- 제목: {title}
- 소스: {item.get('source', '?')}
- URL: {item.get('url', '?')}
- 초록: {abstract[:1000] if abstract else '(없음)'}

GitHub 레포, HuggingFace 모델, 프로젝트 페이지, 데모, ComfyUI 노드 등을 찾아서 리포트해줘."""

    messages = [
        {"role": "system", "content": AGENT_SYSTEM},
        {"role": "user", "content": user_msg},
    ]

    for turn in range(max_turns):
        logger.info(f"--- Turn {turn + 1}/{max_turns} ---")

        try:
            resp = client.chat.completions.create(
                model=cfg["OLLAMA_MODEL"],
                messages=messages,
                tools=TOOLS,
                temperature=0.2,
                max_tokens=4000,
                timeout=cfg["OLLAMA_TIMEOUT"],
            )
        except Exception as e:
            logger.error(f"Gemma call failed: {e}")
            break

        choice = resp.choices[0] if resp.choices else None
        if not choice:
            logger.warning("Empty response from Gemma")
            break

        msg = choice.message

        # Add assistant message to history
        messages.append(msg)

        # Check for tool calls
        if msg.tool_calls:
            for tc in msg.tool_calls:
                fn_name = tc.function.name
                try:
                    fn_args = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    fn_args = {}

                logger.info(f"Tool call: {fn_name}({json.dumps(fn_args, ensure_ascii=False)[:100]})")

                # Handle finish
                if fn_name == "finish":
                    report = fn_args.get("report", fn_args)
                    logger.info("Agent finished!")
                    return report

                # Execute tool
                result = await execute_tool(fn_name, fn_args)
                logger.info(f"Tool result: {result[:150]}...")

                # Add tool result to messages
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result,
                })
        else:
            # No tool call — check if content has JSON (fallback for models that don't use tool_calls)
            content = (msg.content or "").strip()
            if content:
                logger.info(f"Gemma said: {content[:200]}")
                # Try to parse as finish report
                if '"github_repos"' in content or '"key_findings"' in content:
                    try:
                        start = content.find("{")
                        end = content.rfind("}") + 1
                        if start >= 0 and end > start:
                            report = json.loads(content[start:end])
                            logger.info("Parsed finish report from text response")
                            return report
                    except json.JSONDecodeError:
                        pass
            # If model just talked without acting, nudge it
            messages.append({
                "role": "user",
                "content": "도구를 사용해서 조사해줘. 생각만 하지 말고 web_search나 crawl_page를 호출해.",
            })

    logger.warning(f"Agent did not finish within {max_turns} turns")
    return {}


# ── Entry point ──────────────────────────────────────────────────

def fetch_item(item_id: int, cfg: dict) -> dict | None:
    url = f"{cfg['MAIN_PC_URL']}/api/items/{item_id}"
    try:
        r = httpx.get(url, timeout=10)
        r.raise_for_status()
        return r.json()
    except httpx.HTTPError as e:
        logger.error(f"Failed to fetch item {item_id}: {e}")
        return None


async def main():
    parser = argparse.ArgumentParser(description="Arca Research Agent")
    parser.add_argument("--item-id", type=int, required=True)
    parser.add_argument("--max-turns", type=int, default=5)
    args = parser.parse_args()

    cfg = load_config()
    item = fetch_item(args.item_id, cfg)
    if not item:
        sys.exit(1)

    report = await run_agent(item, cfg, max_turns=args.max_turns)

    if report:
        print("\n=== ARCA RESEARCH REPORT ===")
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print("\n=== NO REPORT (agent did not finish) ===")


if __name__ == "__main__":
    asyncio.run(main())
