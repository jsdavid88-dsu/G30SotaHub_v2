import type { Item } from "../types";

/** Canonical source ordering — lower = higher priority */
export const SOURCE_ORDER: Record<string, number> = {
  arxiv: 0,
  github: 1,
  huggingface: 2,
  reddit: 3,
  x: 4,
};

export const PRIORITIES: Item["priority"][] = ["P0", "P1", "P2", "P3", "WATCH"];
