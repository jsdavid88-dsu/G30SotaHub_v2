const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8001";

function getAdminToken(): string {
  return localStorage.getItem("vfx_admin_token") || "";
}

export function setAdminToken(token: string) {
  localStorage.setItem("vfx_admin_token", token);
}

async function adminPost<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    method: "POST",
    headers: { "X-Admin-Token": getAdminToken() },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
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
