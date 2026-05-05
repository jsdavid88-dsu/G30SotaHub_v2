import { apiGet, apiPost } from "./client";

export type Comment = {
  id: number;
  item_id: number;
  user_id: string | null;
  user_name: string | null;
  content: string;
  created_at: string;
  updated_at: string;
};

export const fetchComments = (itemId: number) =>
  apiGet<Comment[]>(`/items/${itemId}/comments`);

export const createComment = (itemId: number, content: string) =>
  apiPost<Comment>(`/items/${itemId}/comments`, { content });
