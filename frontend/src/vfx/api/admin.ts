// VFX admin API client — 통합 환경.
// - baseURL: 빈 문자열 (relative) → 같은 호스트 어디서든 동작
// - Hub 인증: localStorage 'token' (Bearer)
// - 일부 admin 엔드포인트는 X-Admin-Token (worker 용) 도 지원 — 둘 다 보냄
const API_URL = import.meta.env.VITE_API_URL || "";

function getAdminToken(): string {
  return localStorage.getItem("vfx_admin_token") || "";
}

export function setAdminToken(token: string) {
  localStorage.setItem("vfx_admin_token", token);
}

function authHeaders(): Record<string, string> {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
  const adminToken = getAdminToken();
  const h: Record<string, string> = {};
  if (token) h["Authorization"] = `Bearer ${token}`;
  if (adminToken) h["X-Admin-Token"] = adminToken;
  return h;
}

async function adminPost<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1/vfx${path}`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const triggerCrawlAll = () =>
  adminPost<{ status: string; sources: string[] }>("/admin/crawl");

export const triggerCrawlSource = (source: string) =>
  adminPost<{ source: string; fetched?: number; new?: number }>(
    `/admin/crawl/${source}`
  );

export const triggerLinkCodes = () =>
  adminPost<{ status: string }>("/admin/link-codes?max_items=30");

export const triggerBuildLineage = () =>
  adminPost<{ status: string }>("/admin/build-lineage?max_items=50");

export const triggerNightBatch = () =>
  adminPost<{ status: string }>("/admin/night-batch");

// === 카테고리 CRUD (admin / professor 권한) ===

export type CategoryCreatePayload = {
  slug: string;
  name_ko: string;
  name_en: string;
  description?: string;
  icon?: string;
  keywords?: string[];
  github_topics?: string[];
  hf_tags?: string[];
  subreddits?: string[];
  x_accounts?: string[];
  current_sota?: string[];
  display_order?: number;
};

export async function createCategory(payload: CategoryCreatePayload) {
  const res = await fetch(`${API_URL}/api/v1/vfx/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      keywords: [],
      github_topics: [],
      hf_tags: [],
      subreddits: [],
      x_accounts: [],
      current_sota: [],
      display_order: 0,
      ...payload,
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function deleteCategory(slug: string) {
  const res = await fetch(`${API_URL}/api/v1/vfx/categories/${slug}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
}
