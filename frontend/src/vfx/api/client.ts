// VFX API client — 통합 환경.
// - baseURL: 빈 문자열 (relative) → 같은 호스트 (localhost / Tailscale 도메인 / Cloudflare Tunnel) 어디서든 동작.
// - Hub 인증 통합: localStorage 의 token 을 Authorization 헤더로 전달.
const API_URL = import.meta.env.VITE_API_URL || "";

function authHeaders(): Record<string, string> {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1/vfx${path}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1/vfx${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}
