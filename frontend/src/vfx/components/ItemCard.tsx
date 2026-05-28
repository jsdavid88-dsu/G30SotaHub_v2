import { useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Star, Github, UserCheck } from "lucide-react";
import type { Item } from "../types";
import { getCodeLinks, getArcaVerdict } from "../utils/metadata";
import SourceBadge from "./SourceBadge";
import PriorityBadge from "./PriorityBadge";

const ASSIGN_STATUS_COLOR: Record<string, { bg: string; color: string; label: string }> = {
  recommended: { bg: "#f0fdf4", color: "#15803d", label: "추천" },
  assigned:    { bg: "#e0e7ff", color: "#4338ca", label: "배정됨" },
  in_review:   { bg: "#fef3c7", color: "#b45309", label: "리뷰중" },
  submitted:   { bg: "#dbeafe", color: "#1d4ed8", label: "제출" },
  approved:    { bg: "#d1fae5", color: "#047857", label: "승인" },
  rejected:    { bg: "#fee2e2", color: "#dc2626", label: "반려" },
};

function formatDate(d: string | null | undefined): string | null {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" });
  } catch {
    return null;
  }
}

export default function ItemCard({
  item,
  groupSources,
}: {
  item: Item;
  groupSources?: Item["source"][];
}) {
  const [hover, setHover] = useState(false);
  const score = item.llm_score || item.keyword_score;
  const codeLinks = getCodeLinks(item);
  const verdict = getArcaVerdict(item);
  const otherSources = groupSources?.filter((s) => s !== item.source) ?? [];

  const publishedStr = formatDate(item.published_at);
  const discoveredStr = formatDate(item.discovered_at);
  const assignments = item.assignments ?? [];
  const activeAssignment = assignments.find((a) => a.status !== "approved" && a.status !== "rejected") ?? assignments[0];

  return (
    <Link
      to={`/vfx/item/${item.id}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "block",
        background: "var(--color-card)",
        border: `1px solid ${hover ? "var(--color-accent)" : "var(--color-border)"}`,
        borderRadius: 12,
        padding: 16,
        textDecoration: "none",
        boxShadow: hover ? "0 4px 12px rgba(79,70,229,0.10)" : "0 1px 2px rgba(0,0,0,0.02)",
        transform: hover ? "translateY(-1px)" : "none",
        transition: "all 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <SourceBadge source={item.source} />
          {otherSources.map((s) => <SourceBadge key={s} source={s} />)}
          <PriorityBadge priority={item.priority} />
          {score > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--color-warning)", fontWeight: 600 }}>
              <Star style={{ width: 11, height: 11, fill: "currentColor" }} />
              {score}
            </span>
          )}
        </div>
        {/* Nested <a> 회피 — wrapping <Link> 안이라 <span> + onClick window.open. url 없으면 (manual item) 숨김 */}
        {item.url && (
          <span
            role="link"
            tabIndex={0}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(item.url!, "_blank", "noopener,noreferrer"); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); window.open(item.url!, "_blank", "noopener,noreferrer"); } }}
            title="원문 열기"
            style={{ color: "var(--color-text-muted)", display: "inline-flex", cursor: "pointer" }}
          >
            <ExternalLink style={{ width: 14, height: 14 }} />
          </span>
        )}
      </div>

      <h3 style={{
        fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)",
        marginBottom: 6,
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        overflow: "hidden", lineHeight: 1.4,
      }}>
        {item.title}
      </h3>

      {verdict ? (
        <p style={{
          fontSize: 12, color: "var(--color-accent)", fontStyle: "italic", marginBottom: 8,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          💭 {verdict}
        </p>
      ) : (item.description || item.abstract) ? (
        <p style={{
          fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 8,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          lineHeight: 1.5,
        }}>
          {item.description || item.abstract}
        </p>
      ) : null}

      {codeLinks.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          {codeLinks.slice(0, 3).map((link) => (
            <span
              key={link.url}
              role="link"
              tabIndex={0}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(link.url, "_blank", "noopener,noreferrer"); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); window.open(link.url, "_blank", "noopener,noreferrer"); } }}
              title={link.description || link.name}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 8px", borderRadius: 6, fontSize: 10,
                background: "var(--color-success-light)", color: "var(--color-success)",
                border: "1px solid #a7f3d0",
                cursor: "pointer",
              }}
            >
              <Github style={{ width: 11, height: 11 }} />
              <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {link.name.split("/")[1] || link.name}
              </span>
              {link.stars > 0 && <span style={{ opacity: 0.7 }}>★{link.stars}</span>}
            </span>
          ))}
        </div>
      )}

      {/* 날짜 — published_at 우선 (사용자 요청), 없으면 discovered_at fallback */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--color-text-muted)", flexWrap: "wrap" }}>
        {publishedStr ? (
          <span title={`발표일${discoveredStr ? ` · 발견 ${discoveredStr}` : ""}`}>
            <span style={{ fontWeight: 600, color: "var(--color-text-secondary)" }}>발표</span> {publishedStr}
          </span>
        ) : discoveredStr ? (
          <span title="발표일 정보 없음 — 발견일 표시">
            <span style={{ opacity: 0.7 }}>발견</span> {discoveredStr}
          </span>
        ) : null}
        {item.category_slugs.length > 0 && <span>· {item.category_slugs.join(", ")}</span>}
      </div>

      {/* 학생 배정 — 있을 때만 */}
      {activeAssignment && (
        <div style={{
          marginTop: 8, paddingTop: 8, borderTop: "1px solid #f1f5f9",
          display: "flex", alignItems: "center", gap: 6, fontSize: 11,
        }}>
          <UserCheck style={{ width: 11, height: 11, color: "var(--color-text-muted)" }} />
          <span style={{ color: "var(--color-text-secondary)", fontWeight: 500 }}>
            {activeAssignment.assignee_name || "—"}
          </span>
          <span style={{
            padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600,
            background: ASSIGN_STATUS_COLOR[activeAssignment.status]?.bg ?? "#f1f5f9",
            color: ASSIGN_STATUS_COLOR[activeAssignment.status]?.color ?? "#64748b",
          }}>
            {ASSIGN_STATUS_COLOR[activeAssignment.status]?.label ?? activeAssignment.status}
          </span>
          {assignments.length > 1 && (
            <span style={{ color: "var(--color-text-muted)", fontSize: 10 }}>+{assignments.length - 1}</span>
          )}
        </div>
      )}
    </Link>
  );
}
