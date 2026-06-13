import { apiGet, apiPost } from "./client";

export type Comment = {
  id: number;
  item_id: number;
  user_id: string | null;
  user_name: string | null;
  content: string;
  kind?: "comment" | "confirm";
  user_role?: string | null;
  created_at: string;
  updated_at: string;
};

export const fetchComments = (itemId: number) =>
  apiGet<Comment[]>(`/items/${itemId}/comments`);

export const createComment = (itemId: number, content: string, kind: "comment" | "confirm" = "comment") =>
  apiPost<Comment>(`/items/${itemId}/comments`, { content, kind });

export type ResearchLogEntry = {
  type: "daily" | "review" | "media";
  id: string;
  author_id: string | null;
  author_name: string | null;
  content?: string;
  section?: string;
  log_date?: string | null;
  created_at: string | null;
  // 어느 모델 활동인지 (통합 피드에서 표시)
  item_id?: number | null;
  item_title?: string | null;
  // media
  media_type?: string;
  file_name?: string | null;
  mime?: string | null;
  fps?: number | null;
  preview_status?: string | null;
  attachment_id?: string;
  stream_url?: string;
  thumbnail_url?: string | null;
};

export const fetchResearchLog = (itemId: number) =>
  apiGet<ResearchLogEntry[]>(`/items/${itemId}/research-log`);

export type WeeklyReport = {
  id: string;
  title: string;
  period_start: string;
  period_end: string;
  created_at: string | null;
  content: {
    summary?: string;
    totals?: { new_models: number; daily_blocks: number; reviews: number; confirms: number };
    daily_by_student?: { student: string; blocks: number }[];
    reviews_by_model?: { model: string; reviews: number }[];
    new_models?: { id: number; title: string }[];
  };
};

export const fetchWeeklyReport = () =>
  apiGet<WeeklyReport | null>(`/items/research-weekly`);

export const generateWeeklyReport = () =>
  apiPost<WeeklyReport>(`/items/research-weekly/generate`, {});

export type FeedScope = "all" | "category" | "student" | "item";

export type RawSnapshot = {
  id: number;
  source: string | null;
  external_id: string | null;
  raw_title: string | null;
  raw_abstract: string | null;
  raw_authors: string | null;
  raw_url: string | null;
  raw_metadata: Record<string, unknown> | null;
  content_hash: string | null;
  fetched_at: string | null;
};

export const fetchItemRaw = (itemId: number) =>
  apiGet<RawSnapshot[]>(`/ontology/items/${itemId}/raw`);

export const fetchResearchFeed = (params: {
  scope: FeedScope; category?: string; student_id?: string; item_id?: number;
}) => {
  const qs = new URLSearchParams({ scope: params.scope });
  if (params.category) qs.set("category", params.category);
  if (params.student_id) qs.set("student_id", params.student_id);
  if (params.item_id != null) qs.set("item_id", String(params.item_id));
  return apiGet<ResearchLogEntry[]>(`/items/research-feed?${qs.toString()}`);
};
