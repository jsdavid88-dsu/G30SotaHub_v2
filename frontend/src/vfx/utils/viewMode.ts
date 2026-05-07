// VFX 뷰 모드 (카드/테이블) — localStorage 영속.
import { useEffect, useState } from "react";

export type ViewMode = "card" | "table";
const STORAGE_KEY = "vfx.viewMode";

export function getStoredViewMode(): ViewMode {
  if (typeof window === "undefined") return "card";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "table" ? "table" : "card";
}

/** 뷰 모드 hook — localStorage + 다른 탭/창 sync. */
export function useViewMode(): [ViewMode, (m: ViewMode) => void] {
  const [mode, setModeState] = useState<ViewMode>(() => getStoredViewMode());

  // 다른 탭에서 변경 시 sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setModeState(e.newValue === "table" ? "table" : "card");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setMode = (m: ViewMode) => {
    setModeState(m);
    try {
      window.localStorage.setItem(STORAGE_KEY, m);
      // 같은 탭의 다른 컴포넌트에 알림 (storage 이벤트는 다른 탭에서만 발생)
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: m }));
    } catch {
      // ignore
    }
  };

  return [mode, setMode];
}
