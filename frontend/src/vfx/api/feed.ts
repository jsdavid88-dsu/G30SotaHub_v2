import { apiGet } from "./client";
import type { FeedItem } from "../types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8001";

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

export const toggleSave = async (id: number, isSaved: boolean) => {
  const res = await fetch(`${API_URL}/api/feed/${id}/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_saved: isSaved }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as FeedItem;
};

export const triggerFeedCrawl = async (source?: string) => {
  const path = source ? `/feed/crawl/${source}` : `/feed/crawl`;
  const res = await fetch(`${API_URL}/api${path}`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};
