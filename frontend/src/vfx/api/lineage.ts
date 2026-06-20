import { apiGet, apiPost, apiDelete } from "./client";

export type LineageNode = {
  id: number;
  title: string;
  source: string;
  priority: string | null;
  llm_score: number;
  year: number | null;
  url: string | null;
};

export type LineageEdge = {
  id?: number;
  parent_id: number;
  child_id: number;
  relationship_type: string;
  origin?: string; // auto | manual | arca
  status?: string; // confirmed | suggested
  note?: string | null;
};

export type LineageGraph = {
  center_id: number | null;
  nodes: LineageNode[];
  edges: LineageEdge[];
};

export const fetchItemLineage = (itemId: number, depth = 2) =>
  apiGet<LineageGraph>(`/lineage/item/${itemId}?depth=${depth}`);

export const fetchCategoryLineage = (slug: string) =>
  apiGet<LineageGraph>(`/lineage/category/${slug}`);

// ── Phase 3 편집 (professor/admin) — 자유 엣지 + AI 추정 confirm ──
export const createLineageEdge = (body: {
  parent_id: number;
  child_id: number;
  relationship_type?: string;
  note?: string;
}) => apiPost<LineageEdge>(`/lineage/edges`, body);

export const confirmLineageEdge = (edgeId: number) =>
  apiPost<LineageEdge>(`/lineage/edges/${edgeId}/confirm`, {});

export const deleteLineageEdge = (edgeId: number) =>
  apiDelete<void>(`/lineage/edges/${edgeId}`);
