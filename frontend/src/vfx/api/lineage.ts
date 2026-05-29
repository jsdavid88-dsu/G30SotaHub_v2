import { apiGet } from "./client";

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
  parent_id: number;
  child_id: number;
  relationship_type: string;
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
