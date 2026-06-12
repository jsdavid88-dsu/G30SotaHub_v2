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
