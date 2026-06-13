// 온톨로지 대시보드 — Karpathy 3-tier/3-ops 상태 + Lint(위생 점검) 결과 표시.
// API: POST /api/v1/vfx/ontology/lint (admin/professor). raw provenance 는 ItemDetail 에.
import { useState } from "react";
import { isPrivileged, useRole } from "../../contexts/RoleContext";

type LintReport = {
  total_items: number;
  stale: { count: number; auto_tagged: number; item_ids: number[] };
  orphan: { count: number; item_ids: number[] };
  dangling_wikilinks: { count: number; samples: { item_id: number; terms: string[] }[] };
  contradictions: { count: number; groups: { brand: string; field: string; values: string[] }[] };
  duplicates: { count: number; groups: { url: string; item_ids: number[] }[] };
};

const card: React.CSSProperties = {
  background: "var(--color-surface, #fff)",
  border: "1px solid var(--color-border, #e2e8f0)",
  borderRadius: 14,
  padding: 20,
};

function StatCard({ label, value, sub, color }: { label: string; value: number; sub?: string; color: string }) {
  return (
    <div style={{ ...card, textAlign: "center" }}>
      <p style={{ fontSize: 30, fontWeight: 700, color, lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary, #0f172a)", marginTop: 8 }}>{label}</p>
      {sub && <p style={{ fontSize: 11, color: "var(--color-text-muted, #94a3b8)", marginTop: 2 }}>{sub}</p>}
    </div>
  );
}

export default function Ontology() {
  const { currentRole } = useRole();
  const canRun = isPrivileged(currentRole);
  const [report, setReport] = useState<LintReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runLint = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/v1/vfx/ontology/lint", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) {
        setError(res.status === 403 ? "권한이 없습니다 (admin/professor 전용)." : `Lint 실패 (${res.status})`);
        return;
      }
      setReport(await res.json());
    } catch {
      setError("네트워크 오류 — 백엔드 연결을 확인하세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text-primary, #0f172a)", margin: 0 }}>온톨로지 상태</h1>
          <p style={{ fontSize: 13, color: "var(--color-text-muted, #64748b)", marginTop: 4 }}>
            Karpathy 3-tier(raw·wiki·outputs) / 3-ops(Ingest·Query·Lint). 야간배치가 자동 점검하며, 여기서 즉시 실행도 가능.
          </p>
        </div>
        {canRun && (
          <button
            onClick={runLint}
            disabled={loading}
            style={{
              padding: "10px 18px", borderRadius: 10, border: "none", cursor: loading ? "default" : "pointer",
              background: loading ? "#cbd5e1" : "var(--color-accent, #4f46e5)", color: "#fff", fontSize: 14, fontWeight: 600,
            }}
          >
            {loading ? "점검 중..." : "Lint 실행"}
          </button>
        )}
      </div>

      {/* 3-tier / 3-ops 상태 */}
      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}>
        <div><b>3-tier</b> &nbsp; raw 🟢 · wiki 🟢 · outputs 🟢(주간 연구 리포트)</div>
        <div><b>3-ops</b> &nbsp; Ingest 🟢 · Query 🟢 · Lint 🟢</div>
      </div>

      {!canRun && (
        <div style={{ ...card, color: "var(--color-text-muted, #94a3b8)", fontSize: 13 }}>
          Lint 실행은 admin/professor 전용입니다. (야간배치가 자동으로 점검합니다.)
        </div>
      )}

      {error && (
        <div style={{ ...card, borderColor: "#fecaca", background: "#fef2f2", color: "#dc2626", fontSize: 13, marginBottom: 20 }}>{error}</div>
      )}

      {report && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
            <StatCard label="전체 노드" value={report.total_items} color="var(--color-text-primary, #0f172a)" />
            <StatCard label="stale" value={report.stale.count} sub={`자동 태깅 ${report.stale.auto_tagged}`} color="#b45309" />
            <StatCard label="고아(orphan)" value={report.orphan.count} sub="wiki 있는데 링크 0" color="#7c3aed" />
            <StatCard label="dangling 링크" value={report.dangling_wikilinks.count} sub="미등록 참조" color="#0284c7" />
            <StatCard label="모순(contradiction)" value={report.contradictions.count} sub="같은 brand 다른 값" color="#dc2626" />
            <StatCard label="중복(url)" value={report.duplicates.count} color="#64748b" />
          </div>

          {report.contradictions.count > 0 && (
            <div style={{ ...card, marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: "#dc2626" }}>모순 — 같은 brand, 다른 값</h3>
              {report.contradictions.groups.map((g, i) => (
                <div key={i} style={{ fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--color-border, #f1f5f9)" }}>
                  <b>{g.brand}</b> · {g.field}: {g.values.join(" / ")}
                </div>
              ))}
            </div>
          )}

          {report.dangling_wikilinks.count > 0 && (
            <div style={{ ...card, marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: "#0284c7" }}>dangling 위키링크 — 참조됐지만 미등록 (discovery 후보)</h3>
              {report.dangling_wikilinks.samples.map((s, i) => (
                <div key={i} style={{ fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--color-border, #f1f5f9)" }}>
                  item #{s.item_id} → {s.terms.join(", ")}
                </div>
              ))}
            </div>
          )}

          {report.duplicates.count > 0 && (
            <div style={{ ...card, marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: "#64748b" }}>중복 — 같은 URL</h3>
              {report.duplicates.groups.map((g, i) => (
                <div key={i} style={{ fontSize: 12, padding: "6px 0", borderBottom: "1px solid var(--color-border, #f1f5f9)", wordBreak: "break-all" }}>
                  {g.url} · items {g.item_ids.join(", ")}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!report && !error && canRun && (
        <p style={{ color: "var(--color-text-muted, #94a3b8)", fontSize: 13 }}>"Lint 실행"을 눌러 현재 그래프 위생 상태를 점검하세요.</p>
      )}
    </div>
  );
}
