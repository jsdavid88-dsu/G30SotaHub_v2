// raw provenance — Karpathy raw tier. 이 모델 정보가 어느 소스에서 언제 수집됐는지(불변 원본 이력).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Database, ChevronDown, ChevronRight } from "lucide-react";
import { fetchItemRaw } from "../api/comments";
import { cardStyle, sectionHeaderStyle } from "../design";

const sourceColor: Record<string, string> = {
  arxiv: "#dc2626", github: "#0f172a", hf: "#ea580c", reddit: "#c2410c", x: "#0f172a",
  manual: "#92400e", ldr: "#7c3aed",
};

export default function RawProvenance({ itemId }: { itemId: number }) {
  const [open, setOpen] = useState(false);
  const { data: snaps = [], isLoading } = useQuery({
    queryKey: ["item-raw", itemId],
    queryFn: () => fetchItemRaw(itemId),
  });

  // 원본 이력이 없으면 섹션 자체를 숨김 (수동 등록 모델 등)
  if (!isLoading && snaps.length === 0) return null;

  return (
    <section style={{ ...cardStyle, overflow: "hidden" }}>
      <button onClick={() => setOpen((v) => !v)}
        style={{ ...sectionHeaderStyle, display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
        <Database style={{ width: 16, height: 16, color: "var(--color-accent)" }} />
        <span style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>
          원본 이력 <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>({snaps.length})</span>
        </span>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)", marginLeft: 8 }}>raw tier · 어디서 언제 수집됐나</span>
        {open ? <ChevronDown style={{ width: 16, height: 16, marginLeft: "auto", color: "#94a3b8" }} />
              : <ChevronRight style={{ width: 16, height: 16, marginLeft: "auto", color: "#94a3b8" }} />}
      </button>

      {open && (
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          {snaps.map((s) => (
            <div key={s.id} style={{ padding: "12px 16px", borderRadius: 12, background: "#f8fafc", border: "1px solid var(--color-border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", padding: "1px 8px", borderRadius: 6, background: sourceColor[s.source || ""] || "#64748b" }}>
                  {(s.source || "?").toUpperCase()}
                </span>
                {s.external_id && <span style={{ fontSize: 11, color: "#94a3b8" }}>{s.external_id}</span>}
                <span style={{ fontSize: 11, color: "var(--color-text-muted)", marginLeft: "auto" }}>
                  {s.fetched_at ? new Date(s.fetched_at).toLocaleString("ko-KR") : ""}
                </span>
              </div>
              {s.raw_title && <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", margin: "0 0 4px" }}>{s.raw_title}</p>}
              {s.raw_authors && <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 4px" }}>{s.raw_authors}</p>}
              {s.raw_abstract && (
                <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5, margin: 0,
                  display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as any, overflow: "hidden" }}>
                  {s.raw_abstract}
                </p>
              )}
              <div style={{ display: "flex", gap: 12, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                {s.raw_url && (
                  <a href={s.raw_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--color-accent)", textDecoration: "none" }}>원본 ↗</a>
                )}
                {s.content_hash && <span style={{ fontSize: 10, color: "#cbd5e1", fontFamily: "monospace" }}>#{s.content_hash.slice(0, 12)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
