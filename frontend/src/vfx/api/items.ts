import { apiGet, apiPatch, apiPost } from "./client";
import type { Item } from "../types";

export type SortKey =
  | "discovered"
  | "discovered_asc"
  | "published"
  | "published_asc"
  | "score"
  | "keyword_score"
  | "priority";

export type WorkflowStatus = "new" | "triaged" | "holding" | "skipped" | "archived";
export type LifecycleStatus = "research" | "dev" | "testing" | "production" | "deprecated";

export type ItemFilters = {
  source?: string;
  priority?: string;
  category?: string;
  since?: string;
  min_score?: number;
  workflow?: WorkflowStatus;
  lifecycle?: LifecycleStatus;
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

// ── Triage / Workflow 액션 ────────────────────────────────────────────────

export type ItemPatchPayload = {
  status?: WorkflowStatus;
  lifecycle_status?: LifecycleStatus;
  priority?: "P0" | "P1" | "P2" | "P3" | "WATCH";
  description?: string;
};

export const patchItem = (id: number, body: ItemPatchPayload) =>
  apiPatch<Item>(`/items/${id}`, body);

export type TriageActionType =
  | "assign"
  | "motorhead"
  | "hold"
  | "skip"
  | "complete"
  | "follow_up"
  | "archive";

export type TriagePayload = {
  action: TriageActionType;
  assignee_id?: string;
  due_date?: string;
  note?: string;
};

export const triageItem = (id: number, body: TriagePayload) =>
  apiPost<Item>(`/items/${id}/triage`, body);
