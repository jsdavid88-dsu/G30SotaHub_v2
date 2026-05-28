// Phase 1 통합 후 — Hub 통합 client 사용 (vfx baseURL = /api/v1/vfx).
// 이전 standalone vfx-sota-monitor (localhost:8001/api/feed) hardcoded URL 제거.
import { apiGet, apiPost, apiDelete } from "./client";
import type { FeedItem } from "../types";

export type FeedFilters = {
  source?: string;
  tag?: string;
  saved?: boolean;
  since?: string;
  limit?: number;
  offset?: number;
};

export const fetchFeed = (filters: FeedFilters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") params.append(k, String(v));
  });
  const q = params.toString();
  return apiGet<FeedItem[]>(`/feed${q ? `?${q}` : ""}`);
};

export const fetchFeedItem = (id: number) => apiGet<FeedItem>(`/feed/${id}`);

export const toggleSave = (id: number, isSaved: boolean) =>
  apiPost<FeedItem>(`/feed/${id}/save`, { is_saved: isSaved });

export const deleteFeedItem = (id: number) => apiDelete<void>(`/feed/${id}`);

export const triggerFeedCrawl = (source?: string) => {
  const path = source ? `/feed/crawl/${source}` : `/feed/crawl`;
  return apiPost<unknown>(path, {});
};
