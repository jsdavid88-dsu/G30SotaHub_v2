import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Search, RefreshCw, Settings } from "lucide-react";
import {
  setAdminToken,
  triggerBuildLineage,
  triggerCrawlAll,
  triggerLinkCodes,
} from "../../api/admin";

export default function Header() {
  const [q, setQ] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const navigate = useNavigate();

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = q.trim();
    if (trimmed.length >= 2) {
      navigate(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  };

  const ensureToken = (): boolean => {
    const existing = localStorage.getItem("vfx_admin_token");
    if (existing) return true;
    const token = prompt("Admin Token을 입력하세요 (backend .env의 ADMIN_TOKEN)");
    if (!token) return false;
    setAdminToken(token);
    return true;
  };

  const doAction = async (action: () => Promise<unknown>, label: string) => {
    if (!ensureToken()) return;
    setBusy(true);
    setMsg(`${label} 실행 중...`);
    try {
      await action();
      setMsg(`✓ ${label} 시작됨`);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      setMsg(`✗ ${label} 실패: ${err}`);
    } finally {
      setBusy(false);
      setMenuOpen(false);
      setTimeout(() => setMsg(null), 5000);
    }
  };

  return (
    <header className="relative flex items-center justify-between border-b border-neutral-800 bg-neutral-900/40 px-6 py-3 backdrop-blur">
      <form onSubmit={onSearch} className="flex items-center gap-3 flex-1 max-w-lg">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="논문, 모델, 저장소 검색... (Enter)"
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900 py-2 pl-10 pr-4 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-brand-500 focus:outline-none"
          />
        </div>
      </form>

      <div className="flex items-center gap-3">
        {msg && <span className="text-[11px] text-neutral-400">{msg}</span>}

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg border border-neutral-800 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
          >
            <Settings className="h-3.5 w-3.5" />
            관리
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-lg border border-neutral-800 bg-neutral-900 shadow-xl z-50">
              <button
                onClick={() => doAction(triggerCrawlAll, "전체 크롤")}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-800"
              >
                <RefreshCw className="h-3 w-3" />
                전체 수집 (arXiv + GH + HF + Reddit)
              </button>
              <button
                onClick={() => doAction(triggerLinkCodes, "코드 링크")}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-800 border-t border-neutral-800"
              >
                🔗 논문-코드 링크 재탐색
              </button>
              <button
                onClick={() => doAction(triggerBuildLineage, "계보 빌드")}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-800 border-t border-neutral-800"
              >
                🌲 기술 계보 빌드
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem("vfx_admin_token");
                  setMsg("Admin token 초기화됨");
                  setMenuOpen(false);
                  setTimeout(() => setMsg(null), 3000);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-neutral-500 hover:bg-neutral-800 border-t border-neutral-800"
              >
                토큰 초기화
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
