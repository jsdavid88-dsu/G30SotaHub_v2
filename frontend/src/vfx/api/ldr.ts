// LDR 수동 연구 큐 API (#11 후속).
import { apiGet, apiPost, apiPatch, apiDelete } from "./client";

export type LdrQueueItem = {
  id: number;
  query: string;
  note: string | null;
  active: boolean;
  last_run_at: string | null;
  run_count: number;
  created_at: string | null;
};

export type LdrPreview = { queries: string[]; manual_used: number; total: number };

export const fetchLdrQueue = () => apiGet<LdrQueueItem[]>("/ldr-queue");
export const fetchLdrPreview = () => apiGet<LdrPreview>("/ldr-queue/preview");
export const addLdrQuery = (query: string, note?: string) =>
  apiPost<LdrQueueItem>("/ldr-queue", { query, note: note || null });
export const patchLdrQuery = (id: number, body: { active?: boolean; query?: string; note?: string }) =>
  apiPatch<LdrQueueItem>(`/ldr-queue/${id}`, body);
export const deleteLdrQuery = (id: number) => apiDelete<void>(`/ldr-queue/${id}`);
