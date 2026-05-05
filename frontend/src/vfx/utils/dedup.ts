import type { Item } from "../types";
import { SOURCE_ORDER } from "./constants";

/**
 * Deduplicate items by group_id — keep the best representative per group.
 * Items without a group_id pass through as-is.
 * Preserves original array order (first occurrence position of each group).
 * Returns deduped items + a map from group_id to all sources in that group.
 */
export function dedup(items: Item[]) {
  // Pre-build group map: group_id → all items in that group
  const groupMap = new Map<number, Item[]>();
  for (const item of items) {
    if (item.group_id != null) {
      const list = groupMap.get(item.group_id) ?? [];
      list.push(item);
      groupMap.set(item.group_id, list);
    }
  }

  // Pick best representative per group (arxiv > github > hf, then highest score)
  const bestOf = new Map<number, Item>();
  const groupSources = new Map<number, Item["source"][]>();
  for (const [gid, group] of groupMap) {
    group.sort((a, b) => {
      const oa = SOURCE_ORDER[a.source] ?? 9;
      const ob = SOURCE_ORDER[b.source] ?? 9;
      if (oa !== ob) return oa - ob;
      const sa = a.llm_score > 0 ? a.llm_score : a.keyword_score;
      const sb = b.llm_score > 0 ? b.llm_score : b.keyword_score;
      return sb - sa;
    });
    bestOf.set(gid, group[0]);
    groupSources.set(gid, [...new Set(group.map((i) => i.source))]);
  }

  // Single pass preserving original order
  const seen = new Set<number>();
  const deduped: Item[] = [];
  for (const item of items) {
    if (item.group_id == null) {
      deduped.push(item);
    } else if (!seen.has(item.group_id)) {
      seen.add(item.group_id);
      deduped.push(bestOf.get(item.group_id)!);
    }
  }

  return { deduped, groupSources };
}
