// 카드 ↔ 테이블 뷰 토글 — localStorage 영속.
import { LayoutGrid, Table2 } from "lucide-react";
import { useViewMode, type ViewMode } from "../utils/viewMode";

type Props = {
  // controlled 모드 (선택). 미사용 시 useViewMode hook 사용.
  value?: ViewMode;
  onChange?: (m: ViewMode) => void;
  size?: "sm" | "md";
};

export default function ViewToggle({ value, onChange, size = "md" }: Props) {
  const [globalMode, setGlobalMode] = useViewMode();
  const mode = value ?? globalMode;
  const setMode = onChange ?? setGlobalMode;

  const padding = size === "sm" ? "4px 8px" : "6px 10px";
  const iconSize = size === "sm" ? 13 : 14;
  const fontSize = size === "sm" ? 11 : 12;

  const btn = (target: ViewMode, icon: typeof LayoutGrid, label: string) => {
    const active = mode === target;
    const Icon = icon;
    return (
      <button
        onClick={() => setMode(target)}
        title={`${label} 뷰`}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding, borderRadius: 6,
          fontSize, fontWeight: 600,
          background: active ? "var(--color-accent)" : "transparent",
          color: active ? "#fff" : "var(--color-text-muted)",
          border: "none", cursor: "pointer",
          transition: "all 0.12s",
        }}
      >
        <Icon style={{ width: iconSize, height: iconSize }} />
        {size !== "sm" && label}
      </button>
    );
  };

  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 2,
      padding: 3, borderRadius: 8,
      background: "#f1f5f9", border: "1px solid var(--color-border)",
    }}>
      {btn("card", LayoutGrid, "카드")}
      {btn("table", Table2, "표")}
    </div>
  );
}
