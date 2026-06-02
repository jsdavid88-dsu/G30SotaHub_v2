// VFX API client — 통합 환경.
// - baseURL: 빈 문자열 (relative) → 같은 호스트 (localhost / Tailscale 도메인 / Cloudflare Tunnel) 어디서든 동작.
// - Hub 인증 통합: localStorage 의 token 을 Authorization 헤더로 전달.
const API_URL = import.meta.env.VITE_API_URL || "";

function authHeaders(): Record<string, string> {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function _request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1/vfx${path}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const apiGet = <T>(path: string) => _request<T>("GET", path);
export const apiPost = <T>(path: string, body: unknown) => _request<T>("POST", path, body);
export const apiPatch = <T>(path: string, body: unknown) => _request<T>("PATCH", path, body);
export const apiPut = <T>(path: string, body: unknown) => _request<T>("PUT", path, body);
export const apiDelete = <T>(path: string) => _request<T>("DELETE", path);
