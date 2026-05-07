import { Sparkles, AlertTriangle, GitBranch, Wrench, Languages } from "lucide-react";
import { cardStyle } from "../design";

export type ArcaAnalysis = {
  verdict?: string;
  practical_value?: string;
  lineage_thought?: string;
  translation?: string;
  warning?: string;
  category?: string;
};

function Section({ icon: Icon, label, children, tone = "default" }: {
  icon: React.ElementType; label: string; children: React.ReactNode;
  tone?: "default" | "warning";
}) {
  const accent = tone === "warning" ? "var(--color-warning)" : "var(--color-accent)";
  const bg = tone === "warning" ? "var(--color-warning-light)" : "var(--color-accent-light)";
  return (
    <div style={{ ...cardStyle, padding: 20 }}>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "4px 10px", borderRadius: 6, marginBottom: 12,
        background: bg, color: accent,
        fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
      }}>
        <Icon style={{ width: 13, height: 13 }} />
        {label}
      </div>
      <div style={{ fontSize: 14, color: "var(--color-text-primary)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
        {children}
      </div>
    </div>
  );
}

export default function ArcaPanel({ analysis }: { analysis: ArcaAnalysis | null }) {
  if (!analysis) return null;
  const { verdict, practical_value, lineage_thought, translation, warning } = analysis;
  const hasAny = verdict || practical_value || lineage_thought || translation || warning;
  if (!hasAny) return null;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "5px 12px", borderRadius: 99,
          background: "var(--color-accent-light)", color: "var(--color-accent-dark)",
          border: "1px solid #c7d2fe",
          fontSize: 12, fontWeight: 600,
        }}>
          <Sparkles style={{ width: 13, height: 13 }} />
          아르카의 분석
        </div>
        <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
          Gemma 4 26B · 천재미소녀 연구원 페르소나
        </span>
      </div>

      {verdict && (
        <div style={{
          ...cardStyle, padding: 24,
          background: "linear-gradient(135deg, var(--color-accent-light) 0%, transparent 100%)",
          borderColor: "#c7d2fe",
        }}>
          <p style={{ fontSize: 17, fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.5 }}>
            {verdict}
          </p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
        {practical_value && <Section icon={Wrench} label="실무 가치">{practical_value}</Section>}
        {lineage_thought && <Section icon={GitBranch} label="기술 계보">{lineage_thought}</Section>}
      </div>

      {translation && <Section icon={Languages} label="초록 번역">{translation}</Section>}
      {warning && <Section icon={AlertTriangle} label="경고" tone="warning">{warning}</Section>}
    </section>
  );
}
