// VFX 대시보드 영역 서브내비 — 사이드바 비대화 방지.
// 개요/타임라인/계보 그래프/진단(온톨로지)을 사이드바 대신 여기서 전환.
import { Link, useLocation } from "react-router-dom";
import { useRole, isPrivileged } from "../../contexts/RoleContext";

const TABS: { path: string; label: string; adminOnly?: boolean }[] = [
  { path: "/vfx", label: "개요" },
  { path: "/vfx/timeline", label: "타임라인" },
  { path: "/vfx/graph", label: "계보 그래프" },
  { path: "/vfx/ontology", label: "진단", adminOnly: true },
];

export default function VfxSubNav() {
  const { pathname } = useLocation();
  const { currentRole } = useRole();
  const privileged = isPrivileged(currentRole);

  return (
    <div style={{
      display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 20,
      borderBottom: "1px solid var(--color-border, #e2e8f0)", paddingBottom: 0,
    }}>
      {TABS.filter((t) => !t.adminOnly || privileged).map((t) => {
        const active = pathname === t.path;
        return (
          <Link key={t.path} to={t.path}
            style={{
              padding: "8px 16px", fontSize: 13, fontWeight: 600, textDecoration: "none",
              color: active ? "var(--color-accent, #4f46e5)" : "var(--color-text-muted, #64748b)",
              borderBottom: active ? "2px solid var(--color-accent, #4f46e5)" : "2px solid transparent",
              marginBottom: -1,
            }}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
