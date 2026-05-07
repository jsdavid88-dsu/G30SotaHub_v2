// VFX Item 테이블 뷰 — 엑셀처럼 한눈에 보기.
// 컬럼: 모델명/source/발표일/발견일/우선순위/점수/담당자/상태/리뷰코멘트/원문
// Hub design language 따름 (inline + var(--color-*)).
import { Link } from "react-router-dom";
import { ExternalLink, Star, ChevronUp, ChevronDown } from "lucide-react";
import type { Item, SotaAssignment } from "../types";
import SourceBadge from "./SourceBadge";
import PriorityBadge from "./PriorityBadge";
import TriageActions from "./TriageActions";

const ASSIGN_STATUS_COLOR: Record<string, { bg: string; color: string; label: string }> = {
  recommended: { bg: "#f0fdf4", color: "#15803d", label: "추천" },
  assigned:    { bg: "#e0e7ff", color: "#4338ca", label: "배정됨" },
  in_review:   { bg: "#fef3c7", color: "#b45309", label: "리뷰중" },
  submitted:   { bg: "#dbeafe", color: "#1d4ed8", label: "제출완료" },
  approved:    { bg: "#d1fae5", color: "#047857", label: "승인" },
  rejected:    { bg: "#fee2e2", color: "#dc2626", label: "반려" },
};

const LIFECYCLE_COLOR: Record<string, { bg: string; color: string; label: string }> = {
  research:   { bg: "#f1f5f9", color: "#475569", label: "연구" },
  dev:        { bg: "#dbeafe", color: "#1d4ed8", label: "개발" },
  testing:    { bg: "#fef3c7", color: "#b45309", label: "테스트" },
  production: { bg: "#d1fae5", color: "#047857", label: "운영" },
  deprecated: { bg: "#fee2e2", color: "#dc2626", label: "폐기" },
};

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" });
  } catch {
    return "—";
  }
}

function getLatestReview(a: SotaAssignment): string | null {
  if (!a.reviews || a.reviews.length === 0) return null;
  // 가장 최근 review 의 content 첫 줄
  const sorted = [...a.reviews].sort((x, y) => {
    const tx = x.submitted_at ? new Date(x.submitted_at).getTime() : 0;
    const ty = y.submitted_at ? new Date(y.submitted_at).getTime() : 0;
    return ty - tx;
  });
  return sorted[0]?.content?.split("\n")[0] ?? null;
}

export type SortKey =
  | "title"
  | "source"
  | "published_at"
  | "discovered_at"
  | "priority"
  | "score"
  | "assignee"
  | "lifecycle";

export type SortDir = "asc" | "desc";

type Props = {
  items: Item[];
  sortKey?: SortKey;
  sortDir?: SortDir;
  onSort?: (key: SortKey) => void;
  // Triage 액션 컬럼 표시 여부 (기본 false — Dashboard/CategoryDetail 에선 안 보임, Triage 페이지/명시 옵션에서만)
  showActions?: boolean;
  onActionDone?: () => void;
  onRequestAssign?: (itemId: number, mode: "assign" | "motorhead") => void;
};

const thStyle: React.CSSProperties = {
  position: "sticky" as const,
  top: 0,
  background: "#f8fafc",
  textAlign: "left" as const,
  fontSize: 11,
  fontWeight: 700,
  color: "var(--color-text-secondary)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  padding: "10px 12px",
  borderBottom: "1px solid var(--color-border)",
  whiteSpace: "nowrap" as const,
  cursor: "pointer",
  userSelect: "none" as const,
};

const tdStyle: React.CSSProperties = {
  padding: "12px",
  fontSize: 13,
  color: "var(--color-text-primary)",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "top" as const,
};

function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return null;
  return dir === "asc"
    ? <ChevronUp style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle", marginLeft: 2 }} />
    : <ChevronDown style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle", marginLeft: 2 }} />;
}

export default function ItemTable({
  items, sortKey = "published_at", sortDir = "desc", onSort,
  showActions = false, onActionDone, onRequestAssign,
}: Props) {
  if (items.length === 0) {
    return (
      <div style={{
        padding: 32, textAlign: "center", fontSize: 13,
        color: "var(--color-text-muted)",
        border: "1px dashed var(--color-border)", borderRadius: 12,
      }}>
        조건에 맞는 아이템이 없습니다
      </div>
    );
  }

  const Th = ({ k, label, width }: { k: SortKey; label: string; width?: number | string }) => (
    <th
      style={{ ...thStyle, ...(width ? { width } : {}) }}
      onClick={() => onSort?.(k)}
      title={`${label} 정렬`}
    >
      {label}
      <SortIndicator active={sortKey === k} dir={sortDir} />
    </th>
  );

  return (
    <div style={{
      overflowX: "auto",
      borderRadius: 12,
      border: "1px solid var(--color-border)",
      background: "#fff",
    }}>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }}>
        <thead>
          <tr>
            <Th k="title" label="모델 / 논문" />
            <Th k="source" label="출처" width={100} />
            <Th k="published_at" label="발표일" width={90} />
            <Th k="discovered_at" label="발견일" width={90} />
            <Th k="priority" label="우선순위" width={80} />
            <Th k="score" label="점수" width={70} />
            <Th k="assignee" label="담당자" width={140} />
            <Th k="lifecycle" label="라이프사이클" width={90} />
            <th style={{ ...thStyle, cursor: "default", width: 220 }}>최근 리뷰 / 결과</th>
            <th style={{ ...thStyle, cursor: "default", width: 50, textAlign: "center" as const }}>원문</th>
            {showActions && (
              <th style={{ ...thStyle, cursor: "default", width: 280 }}>액션</th>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const score = item.llm_score || item.keyword_score;
            const assignments = item.assignments ?? [];
            const active = assignments.find((a) => a.status !== "approved" && a.status !== "rejected") ?? assignments[0];
            const reviewSnippet = active ? getLatestReview(active) : null;
            const lifecycleInfo = item.lifecycle_status ? LIFECYCLE_COLOR[item.lifecycle_status] : null;

            return (
              <tr
                key={item.id}
                style={{ transition: "background 0.1s" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "#f8fafc"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}
              >
                {/* 모델 / 논문 */}
                <td style={tdStyle}>
                  <Link
                    to={`/vfx/item/${item.id}`}
                    style={{ color: "var(--color-text-primary)", textDecoration: "none", fontWeight: 500 }}
                  >
                    <div style={{
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      overflow: "hidden", lineHeight: 1.4, maxWidth: 460,
                    }}>
                      {item.title}
                    </div>
                  </Link>
                  {(item.description || item.abstract) && (
                    <div style={{
                      fontSize: 11, color: "var(--color-text-muted)", marginTop: 4,
                      display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical",
                      overflow: "hidden", maxWidth: 460,
                    }}>
                      {item.description || item.abstract}
                    </div>
                  )}
                </td>

                {/* 출처 */}
                <td style={tdStyle}>
                  <SourceBadge source={item.source} />
                </td>

                {/* 발표일 */}
                <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {item.published_at ? (
                    <span style={{ fontWeight: 500 }}>{formatDate(item.published_at)}</span>
                  ) : (
                    <span style={{ color: "var(--color-text-muted)" }}>—</span>
                  )}
                </td>

                {/* 발견일 */}
                <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: "var(--color-text-muted)" }}>
                  {formatDate(item.discovered_at)}
                </td>

                {/* 우선순위 */}
                <td style={tdStyle}>
                  <PriorityBadge priority={item.priority} />
                </td>

                {/* 점수 */}
                <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums" }}>
                  {score > 0 ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "var(--color-warning)", fontWeight: 600 }}>
                      <Star style={{ width: 11, height: 11, fill: "currentColor" }} />
                      {score}
                    </span>
                  ) : (
                    <span style={{ color: "var(--color-text-muted)" }}>—</span>
                  )}
                </td>

                {/* 담당자 */}
                <td style={tdStyle}>
                  {active ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={{ fontWeight: 500 }}>{active.assignee_name || "—"}</span>
                      <span style={{
                        alignSelf: "flex-start",
                        padding: "1px 7px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                        background: ASSIGN_STATUS_COLOR[active.status]?.bg ?? "#f1f5f9",
                        color: ASSIGN_STATUS_COLOR[active.status]?.color ?? "#64748b",
                      }}>
                        {ASSIGN_STATUS_COLOR[active.status]?.label ?? active.status}
                      </span>
                      {assignments.length > 1 && (
                        <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>
                          +{assignments.length - 1}명 더
                        </span>
                      )}
                    </div>
                  ) : (
                    <span style={{ color: "var(--color-text-muted)" }}>미배정</span>
                  )}
                </td>

                {/* 라이프사이클 */}
                <td style={tdStyle}>
                  {lifecycleInfo ? (
                    <span style={{
                      padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: lifecycleInfo.bg, color: lifecycleInfo.color,
                    }}>
                      {lifecycleInfo.label}
                    </span>
                  ) : (
                    <span style={{ color: "var(--color-text-muted)" }}>—</span>
                  )}
                </td>

                {/* 최근 리뷰 / 결과 */}
                <td style={tdStyle}>
                  {reviewSnippet ? (
                    <div style={{
                      fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5,
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      overflow: "hidden", maxWidth: 220,
                    }} title={reviewSnippet}>
                      {reviewSnippet}
                    </div>
                  ) : item.llm_reason ? (
                    <div style={{
                      fontSize: 12, color: "var(--color-accent)", fontStyle: "italic", lineHeight: 1.5,
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      overflow: "hidden", maxWidth: 220,
                    }} title={item.llm_reason}>
                      💭 {item.llm_reason}
                    </div>
                  ) : (
                    <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>—</span>
                  )}
                </td>

                {/* 원문 링크 */}
                <td style={{ ...tdStyle, textAlign: "center" as const }}>
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title="원문 열기"
                      style={{
                        display: "inline-flex", color: "var(--color-text-muted)",
                        padding: 4, borderRadius: 4,
                      }}
                    >
                      <ExternalLink style={{ width: 14, height: 14 }} />
                    </a>
                  )}
                </td>

                {/* Triage 액션 */}
                {showActions && (
                  <td style={tdStyle}>
                    <TriageActions
                      item={item}
                      onDone={() => onActionDone?.()}
                      onRequestAssign={onRequestAssign}
                      size="sm"
                    />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
