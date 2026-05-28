// VFX 공통 디자인 토큰 — Hub design language 흡수.
// 모든 VFX 페이지/컴포넌트가 이 파일 import.
import type { CSSProperties } from "react";

export const cardStyle: CSSProperties = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 16,
  boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
};

export const sectionHeaderStyle: CSSProperties = {
  padding: "20px 28px",
  borderBottom: "1px solid #f1f5f9",
};

export const sectionTitleStyle: CSSProperties = {
  fontWeight: 600,
  fontSize: 17,
  color: "var(--color-text-primary)",
};

export const sectionSubtitleStyle: CSSProperties = {
  fontSize: 13,
  color: "var(--color-text-muted)",
  marginTop: 4,
};

export const pageHeadingStyle: CSSProperties = {
  fontSize: 26,
  fontWeight: 600,
  color: "var(--color-text-primary)",
  fontFamily: "var(--font-display)",
};

export const pageSubtitleStyle: CSSProperties = {
  color: "var(--color-text-muted)",
  fontSize: 15,
  marginTop: 6,
  lineHeight: 1.5,
};

export const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid var(--color-border)",
  fontSize: 14,
  background: "#fff",
  color: "var(--color-text-primary)",
  outline: "none",
};

export const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--color-text-secondary)",
  marginBottom: 8,
};

export const btnPrimary: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 14px",
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 600,
  background: "var(--color-accent)",
  color: "#fff",
  border: "none",
  cursor: "pointer",
  transition: "all 0.15s",
};

export const btnSecondary: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 14px",
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 500,
  background: "#fff",
  color: "var(--color-text-secondary)",
  border: "1px solid var(--color-border)",
  cursor: "pointer",
  transition: "all 0.15s",
};

export const btnGhost: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 500,
  background: "transparent",
  color: "var(--color-text-secondary)",
  border: "none",
  cursor: "pointer",
  transition: "all 0.15s",
};

export const badgeStyle = (bg: string, color: string): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "3px 10px",
  borderRadius: 99,
  fontSize: 11,
  fontWeight: 600,
  background: bg,
  color,
  whiteSpace: "nowrap",
});

export const PRIORITY_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  P0:    { bg: "var(--color-danger-light)",  color: "var(--color-danger)",  label: "P0" },
  P1:    { bg: "var(--color-warning-light)", color: "var(--color-warning)", label: "P1" },
  P2:    { bg: "var(--color-success-light)", color: "var(--color-success)", label: "P2" },
  P3:    { bg: "#f1f5f9",                    color: "var(--color-text-muted)", label: "P3" },
  WATCH: { bg: "#f1f5f9",                    color: "var(--color-text-muted)", label: "WATCH" },
};

export const SOURCE_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  arxiv:        { bg: "#fee2e2", color: "#b91c1c", label: "arXiv" },
  github:       { bg: "#1f2937", color: "#fff",    label: "GitHub" },
  huggingface:  { bg: "#fef3c7", color: "#92400e", label: "HF" },
  hf_space:     { bg: "#fef3c7", color: "#92400e", label: "HF Space" },
  hf_paper:     { bg: "#fef3c7", color: "#92400e", label: "HF Paper" },
  reddit:       { bg: "#ffedd5", color: "#c2410c", label: "Reddit" },
  x:            { bg: "#0f172a", color: "#fff",    label: "X" },
  youtube:      { bg: "#fee2e2", color: "#b91c1c", label: "YouTube" },
  paperswithcode: { bg: "#dcfce7", color: "#166534", label: "PwC" },
  crawl4ai:     { bg: "#e0e7ff", color: "#4338ca", label: "Web" },
  manual:       { bg: "#ede9fe", color: "#6d28d9", label: "수동" },
};

// 알 수 없는 source 용 fallback badge (이슈 #15 P2-6 — undefined 스타일 방지).
export const SOURCE_FALLBACK = { bg: "#f1f5f9", color: "#475569" };

export function sourceBadge(source: string): { bg: string; color: string; label: string } {
  const known = SOURCE_COLORS[source];
  if (known) return known;
  // 미등록 source 는 fallback 색 + source 문자열을 label 로 노출 (디버깅에도 유용)
  return { ...SOURCE_FALLBACK, label: source };
}

export const hoverRow = {
  onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.background = "#f8fafc";
  },
  onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.background = "transparent";
  },
};
