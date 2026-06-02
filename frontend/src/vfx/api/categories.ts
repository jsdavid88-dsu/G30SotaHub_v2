import { apiGet, apiPatch } from "./client";
import type { Category } from "../types";

export const fetchCategories = () => apiGet<Category[]>("/categories");
export const fetchCategory = (slug: string) => apiGet<Category>(`/categories/${slug}`);

// 검색 키워드/이름/순서 편집 (admin/professor) — 부분 업데이트
export type CategoryUpdatePayload = Partial<{
  name_ko: string;
  name_en: string;
  description: string | null;
  icon: string | null;
  keywords: string[];
  github_topics: string[];
  hf_tags: string[];
  subreddits: string[];
  x_accounts: string[];
  current_sota: string[];
  display_order: number;
}>;

export const updateCategory = (slug: string, body: CategoryUpdatePayload) =>
  apiPatch<Category>(`/categories/${slug}`, body);
