// Triage 페이지 — 새로 발견된 모델을 빠르게 한 줄씩 분류.
// 액션: 배정 / 모터헤드 / 보류 / 스킵 / 완료 / 후속개발 / 아카이빙 / 복귀
// (메인 대시보드 / 카테고리 페이지의 표 모드에서도 동일 기능 제공 — 이 페이지는 status='new' 필터 진입점)
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, PauseCircle, Loader2, Archive, ChevronLeft, ExternalLink, Star, X } from "lucide-react";
import { fetchItems, type WorkflowStatus, type LifecycleStatus } from "../api/items";
import type { Item } from "../types";
import {
  cardStyle, sectionHeaderStyle, sectionTitleStyle, btnGhost,
  pageHeadingStyle, pageSubtitleStyle, badgeStyle,
} from "../design";
import SourceBadge from "../components/SourceBadge";
import PriorityBadge from "../components/PriorityBadge";
import TriageActions from "../components/TriageActions";
import AssignModal, { type AssignModalState } from "../components/AssignModal";

const TABS: { value: WorkflowStatus; label: string; icon: typeof Inbox; color: string }[] = [
  { value: "new",      label: "새로 발견",  icon: Inbox,           color: "var(--color-accent)" },
  { value: "holding",  label: "보류",       icon: PauseCircle,     color: "var(--color-warning)" },
  { value: "triaged",  label: "진행 중",    icon: Loader2,         color: "var(--color-accent)" },
  { value: "skipped",  label: "스킵",       icon: X,               color: "#64748b" },
  { value: "archived", label: "아카이브",   icon: Archive,         color: "#6b7280" },
];

const LIFECYCLE_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  research:   { label: "연구",   bg: "#f1f5f9", color: "#475569" },
  dev:        { label: "개발",   bg: "#dbeafe", color: "#1d4ed8" },
  testing:    { label: "테스트", bg: "#fef3c7", color: "#b45309" },
  production: { label: "운영",   bg: "#d1fae5", color: "#047857" },
  deprecated: { label: "폐기",   bg: "#fee2e2", color: "#dc2626" },
};

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" });
  } catch {
    return "—";
  }
}

// ── Triage Row ──────────────────────────────────────────────────────────

function TriageRow({ item, onDone, onAssign }: {
  item: Item;
  onDone: () => void;
  onAssign: (itemId: number, mode: "assign" | "motorhead") => void;
}) {
  const score = item.llm_score || item.keyword_score;
  const ls = item.lifecycle_status;
  const lsInfo = ls ? LIFECYCLE_LABEL[ls] : null;
  const activeAssignment = (item.assignments ?? []).find((a) => a.status !== "approved" && a.status !== "rejected");

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) auto",
      gap: 16,
      padding: "16px 20px",
      borderBottom: "1px solid #f1f5f9",
      transition: "background 0.1s",
    }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#f8fafc"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
    >
      {/* 좌: 정보 */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
          <SourceBadge source={item.source} />
          <PriorityBadge priority={item.priority} />
          {score > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--color-warning)", fontWeight: 600 }}>
              <Star style={{ width: 11, height: 11, fill: "currentColor" }} />
              {score}
            </span>
          )}
          {lsInfo && (
            <span style={{
              padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600,
              background: lsInfo.bg, color: lsInfo.color,
            }}>
              {lsInfo.label}
            </span>
          )}
          {activeAssignment && (
            <span style={badgeStyle("var(--color-accent-light)", "var(--color-accent)")}>
              {activeAssignment.assignee_name}
            </span>
          )}
        </div>
        <Link
          to={`/vfx/item/${item.id}`}
          style={{
            display: "block",
            color: "var(--color-text-primary)",
            textDecoration: "none",
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1.4,
            marginBottom: 4,
          }}
        >
          {item.title}
        </Link>
        {(item.description || item.abstract) && (
          <p style={{
            fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            marginBottom: 6,
          }}>
            {item.description || item.abstract}
          </p>
        )}
        <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--color-text-muted)", flexWrap: "wrap", alignItems: "center" }}>
          {item.published_at && (
            <span><span style={{ fontWeight: 600 }}>발표</span> {formatDate(item.published_at)}</span>
          )}
          <span style={{ opacity: 0.7 }}>발견 {formatDate(item.discovered_at)}</span>
          {item.category_slugs.length > 0 && <span>· {item.category_slugs.join(", ")}</span>}
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--color-accent)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3 }}
            >
              원문 <ExternalLink style={{ width: 11, height: 11 }} />
            </a>
          )}
        </div>
      </div>

      {/* 우: 액션 버튼들 */}
      <div style={{ alignSelf: "center", flexShrink: 0 }}>
        <TriageActions item={item} onDone={onDone} onRequestAssign={onAssign} size="sm" />
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────

export default function Triage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<WorkflowStatus>("new");
  const [assignModal, setAssignModal] = useState<AssignModalState>(null);
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleStatus | "">("");

  // 각 탭의 카운트 — hooks 규칙 준수 위해 명시적으로 5개
  const newQ      = useQuery({ queryKey: ["items", "triage-count", "new"],      queryFn: () => fetchItems({ workflow: "new",      limit: 500 }) });
  const holdingQ  = useQuery({ queryKey: ["items", "triage-count", "holding"],  queryFn: () => fetchItems({ workflow: "holding",  limit: 500 }) });
  const triagedQ  = useQuery({ queryKey: ["items", "triage-count", "triaged"],  queryFn: () => fetchItems({ workflow: "triaged",  limit: 500 }) });
  const skippedQ  = useQuery({ queryKey: ["items", "triage-count", "skipped"],  queryFn: () => fetchItems({ workflow: "skipped",  limit: 500 }) });
  const archivedQ = useQuery({ queryKey: ["items", "triage-count", "archived"], queryFn: () => fetchItems({ workflow: "archived", limit: 500 }) });
  const counts: Record<WorkflowStatus, number> = {
    new:      newQ.data?.length      ?? 0,
    holding:  holdingQ.data?.length  ?? 0,
    triaged:  triagedQ.data?.length  ?? 0,
    skipped:  skippedQ.data?.length  ?? 0,
    archived: archivedQ.data?.length ?? 0,
  };

  const { data: items = [], isLoading, refetch } = useQuery({
    queryKey: ["items", "triage", activeTab, lifecycleFilter],
    queryFn: () => fetchItems({
      workflow: activeTab,
      lifecycle: lifecycleFilter || undefined,
      sort: "published",
      limit: 200,
    }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["items"] });
    refetch();
  };

  // lifecycle 필터는 'triaged' 탭에서만 의미 있음
  const showLifecycleFilter = activeTab === "triaged";

  return (
    <div style={{ width: "100%" }}>
      <Link to="/vfx" style={{ ...btnGhost, marginBottom: 16 }}>
        <ChevronLeft style={{ width: 14, height: 14 }} /> 대시보드
      </Link>

      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={pageHeadingStyle}>Triage</h1>
          <p style={pageSubtitleStyle}>
            새로 발견된 모델을 한 줄씩 보면서 빠르게 분류 — 배정 / 보류 / 스킵 / 모터헤드 진행 / 완료 / 후속개발 / 아카이빙
          </p>
        </div>
      </div>

      {/* 탭 */}
      <div style={{
        display: "flex", gap: 4,
        background: "var(--color-card)", border: "1px solid var(--color-border)",
        borderRadius: 12, padding: 4, marginBottom: 20,
        overflowX: "auto",
      }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.value;
          const cnt = counts[t.value];
          return (
            <button
              key={t.value}
              onClick={() => setActiveTab(t.value)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 8,
                fontSize: 13, fontWeight: 600,
                background: active ? t.color : "transparent",
                color: active ? "#fff" : "var(--color-text-secondary)",
                border: "none", cursor: "pointer",
                transition: "all 0.12s",
                whiteSpace: "nowrap",
              }}
            >
              <Icon style={{ width: 14, height: 14 }} />
              {t.label}
              <span style={{
                padding: "1px 8px", borderRadius: 99,
                fontSize: 11, fontVariantNumeric: "tabular-nums",
                background: active ? "rgba(255,255,255,0.25)" : "#f1f5f9",
                color: active ? "#fff" : "var(--color-text-muted)",
              }}>
                {cnt}
              </span>
            </button>
          );
        })}
      </div>

      {/* lifecycle 필터 (진행 중 탭에서만) */}
      {showLifecycleFilter && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--color-text-muted)", fontWeight: 600 }}>라이프사이클:</span>
          {(["", "research", "dev", "testing", "production", "deprecated"] as const).map((v) => {
            const info = v ? LIFECYCLE_LABEL[v] : null;
            const active = lifecycleFilter === v;
            return (
              <button
                key={v}
                onClick={() => setLifecycleFilter(v)}
                style={{
                  padding: "4px 10px", borderRadius: 6,
                  fontSize: 11, fontWeight: 600,
                  background: active ? (info?.bg ?? "var(--color-accent)") : "transparent",
                  color: active ? (info?.color ?? "#fff") : "var(--color-text-muted)",
                  border: `1px solid ${active ? "transparent" : "var(--color-border)"}`,
                  cursor: "pointer",
                }}
              >
                {v ? info?.label : "전체"}
              </button>
            );
          })}
        </div>
      )}

      {/* 본문 */}
      <div style={{ ...cardStyle, overflow: "hidden" }}>
        <div style={sectionHeaderStyle}>
          <div style={sectionTitleStyle}>
            {TABS.find((t) => t.value === activeTab)?.label}
            <span style={{ color: "var(--color-text-muted)", fontWeight: 400, marginLeft: 8 }}>
              ({items.length})
            </span>
          </div>
        </div>
        <div>
          {isLoading ? (
            <div style={{ padding: 48, textAlign: "center", fontSize: 13, color: "var(--color-text-muted)" }}>
              로딩 중...
            </div>
          ) : items.length === 0 ? (
            <div style={{
              padding: 48, textAlign: "center", fontSize: 13,
              color: "var(--color-text-muted)",
            }}>
              {activeTab === "new"
                ? "새로 발견된 항목이 없습니다. 자동 크롤이 새 모델을 발견하면 여기에 표시됩니다."
                : `${TABS.find((t) => t.value === activeTab)?.label} 항목이 없습니다.`}
            </div>
          ) : (
            <div>
              {items.map((item) => (
                <TriageRow
                  key={item.id}
                  item={item}
                  onDone={refresh}
                  onAssign={(id, mode) => setAssignModal({ itemId: id, mode })}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 배정 모달 */}
      <AssignModal
        state={assignModal}
        onClose={() => setAssignModal(null)}
        onDone={refresh}
      />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
