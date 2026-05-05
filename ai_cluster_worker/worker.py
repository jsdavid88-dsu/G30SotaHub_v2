"""AI Cluster Worker — Gemma 4 26B 배치 스코어링.

흐름:
    1. 메인 PC에서 미스코어 아이템 가져오기
    2. Ollama Gemma 4에게 배치로 질문
    3. JSON 파싱해서 LLM 점수/우선순위/근거 추출
    4. 메인 PC에 결과 전송

사용법:
    python worker.py --once
    python worker.py --interval 300
"""
from __future__ import annotations

import argparse
import logging
import sys
import time
from pathlib import Path
from typing import Any

import httpx
import yaml
from openai import OpenAI
from openai._exceptions import OpenAIError

from prompts import SYSTEM_PROMPT, build_user_prompt, parse_response

CONFIG_PATH = Path(__file__).parent / "config.yaml"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)


def load_config() -> dict[str, Any]:
    if not CONFIG_PATH.exists():
        logger.error(f"config.yaml not found at {CONFIG_PATH}")
        logger.error("Copy config.example.yaml to config.yaml and edit MAIN_PC_URL + ADMIN_TOKEN")
        sys.exit(1)
    with open(CONFIG_PATH, encoding="utf-8") as f:
        cfg = yaml.safe_load(f) or {}

    required = ["MAIN_PC_URL", "ADMIN_TOKEN"]
    missing = [k for k in required if not cfg.get(k)]
    if missing:
        logger.error(f"Missing required config keys: {missing}")
        sys.exit(1)

    cfg.setdefault("OLLAMA_BASE_URL", "http://localhost:11434/v1")
    cfg.setdefault("OLLAMA_MODEL", "gemma4:26b")
    cfg.setdefault("OLLAMA_TIMEOUT", 600)
    # 아르카 페르소나 + 풍부한 출력 → 배치 작게, max_tokens 크게
    cfg.setdefault("BATCH_SIZE", 2)
    cfg.setdefault("MAX_ITEMS_PER_RUN", 50)
    cfg.setdefault("TEMPERATURE", 0.35)
    cfg.setdefault("MAX_TOKENS", 6000)
    return cfg


def fetch_pending(cfg: dict) -> list[dict]:
    url = f"{cfg['MAIN_PC_URL']}/api/admin/pending-scoring"
    headers = {"X-Admin-Token": cfg["ADMIN_TOKEN"]}
    params = {"limit": cfg["MAX_ITEMS_PER_RUN"]}
    try:
        r = httpx.get(url, headers=headers, params=params, timeout=30)
        r.raise_for_status()
        return r.json()
    except httpx.HTTPError as e:
        logger.error(f"Failed to fetch pending: {e}")
        return []


def post_updates(updates: list[dict], cfg: dict) -> bool:
    if not updates:
        return True
    url = f"{cfg['MAIN_PC_URL']}/api/admin/score-update"
    headers = {"X-Admin-Token": cfg["ADMIN_TOKEN"], "Content-Type": "application/json"}
    try:
        r = httpx.post(url, headers=headers, json=updates, timeout=60)
        r.raise_for_status()
        data = r.json()
        logger.info(f"Server accepted {data.get('updated', 0)} updates")
        return True
    except httpx.HTTPError as e:
        logger.error(f"Failed to post updates: {e}")
        return False


def score_batch(client: OpenAI, cfg: dict, batch: list[dict]) -> list[dict]:
    """Ask Gemma to score a batch of items."""
    user_msg = build_user_prompt(batch)

    try:
        resp = client.chat.completions.create(
            model=cfg["OLLAMA_MODEL"],
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=cfg["TEMPERATURE"],
            max_tokens=cfg["MAX_TOKENS"],
            timeout=cfg["OLLAMA_TIMEOUT"],
        )
    except OpenAIError as e:
        logger.error(f"Ollama call failed: {e}")
        return []

    content = ""
    if resp.choices:
        content = resp.choices[0].message.content or ""

    if not content:
        logger.warning("Empty response from Gemma")
        return []

    updates = parse_response(content, batch)
    if len(updates) != len(batch):
        logger.warning(
            f"Gemma returned {len(updates)} entries for batch of {len(batch)} "
            "(some items may not be scored)"
        )
    return updates


def run_once(cfg: dict) -> dict:
    """Single run: fetch → score → post. Returns stats."""
    logger.info(f"Connecting to {cfg['MAIN_PC_URL']}")
    pending = fetch_pending(cfg)
    logger.info(f"Fetched {len(pending)} pending items")

    if not pending:
        return {"fetched": 0, "scored": 0, "posted": 0}

    client = OpenAI(
        base_url=cfg["OLLAMA_BASE_URL"],
        api_key="ollama",  # Ollama ignores the value
        timeout=cfg["OLLAMA_TIMEOUT"],
    )

    batch_size = cfg["BATCH_SIZE"]
    all_updates: list[dict] = []

    for i in range(0, len(pending), batch_size):
        batch = pending[i : i + batch_size]
        logger.info(f"Scoring batch {i // batch_size + 1} ({len(batch)} items)")
        updates = score_batch(client, cfg, batch)
        all_updates.extend(updates)

    logger.info(f"Gemma produced {len(all_updates)} updates")

    if all_updates:
        post_updates(all_updates, cfg)

    return {
        "fetched": len(pending),
        "scored": len(all_updates),
        "posted": len(all_updates),
    }


def main():
    parser = argparse.ArgumentParser(description="VFX SOTA AI Cluster Worker")
    parser.add_argument("--once", action="store_true", help="Run once and exit")
    parser.add_argument("--interval", type=int, default=0, help="Polling interval in seconds")
    args = parser.parse_args()

    cfg = load_config()
    logger.info(f"Loaded config — model: {cfg['OLLAMA_MODEL']}, batch: {cfg['BATCH_SIZE']}")

    if args.once or args.interval == 0:
        stats = run_once(cfg)
        logger.info(f"Run complete: {stats}")
    else:
        logger.info(f"Polling every {args.interval}s (Ctrl+C to stop)")
        try:
            while True:
                run_once(cfg)
                time.sleep(args.interval)
        except KeyboardInterrupt:
            logger.info("Stopped")


if __name__ == "__main__":
    main()
