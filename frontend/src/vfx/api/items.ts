import { apiGet } from "./client";
import type { Item } from "../types";

export type SortKey =
  | "discovered"
  | "discovered_asc"
  | "published"
  | "score"
  | "keyword_score"
  | "priority";

export type ItemFilters = {
  source?: string;
  priority?: string;
  category?: string;
  since?: string;
  min_score?: number;
  sort?: SortKey;
  limit?: number;
  offset?: number;
};

export const fetchItems = (filters: ItemFilters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== "" && v !== null) params.append(k, String(v));
  });
  const q = params.toString();
  return apiGet<Item[]>(`/items${q ? `?${q}` : ""}`);
};

export const fetchItem = (id: number) => apiGet<Item>(`/items/${id}`);

export const fetchSiblings = (id: number) => apiGet<Item[]>(`/items/${id}/siblings`);
