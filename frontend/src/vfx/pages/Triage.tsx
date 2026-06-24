// Triage 페이지 — 새로 발견된 모델을 한 줄씩 분류.
// 1트랙: 새로 발견 → (배정) 연구중 → 완료   · 옆길: 보류 / 제외
// 관련도 낮음(Arca 1~6점)은 기본 숨김(7점 필터). 토글로 포함 가능.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, PauseCircle, Loader2, CheckCircle2, ChevronLeft, ExternalLink, Star, X } from "lucide-react";
import { fetchItems, type WorkflowStatus } from "../api/items";
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
  { value: "new",      label: "새로 발견", icon: Inbox,        color: "var(--color-accent)" },
  { value: "triaged",  label: "연구중",    icon: Loader2,      color: "var(--color-accent)" },
  { value: "done",     label: "완료",      icon: CheckCircle2, color: "#059669" },
  { value: "holding",  label: "보류",      icon: PauseCircle,  color: "var(--color-warning)" },
  { value: "skipped",  label: "제외",      icon: X,            color: "#64748b" },
];

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
  const [hideLow, setHideLow] = useState(true);  // 관련도 낮음(1~6점) 기본 숨김

  // 각 탭의 카운트 — hooks 규칙 준수 위해 명시적으로 5개
  const newQ      = useQuery({ queryKey: ["items", "triage-count", "new", hideLow],      queryFn: () => fetchItems({ workflow: "new",      hide_low: hideLow, limit: 500 }) });
  const triagedQ  = useQuery({ queryKey: ["items", "triage-count", "triaged", hideLow],  queryFn: () => fetchItems({ workflow: "triaged",  hide_low: hideLow, limit: 500 }) });
  const doneQ     = useQuery({ queryKey: ["items", "triage-count", "done", hideLow],     queryFn: () => fetchItems({ workflow: "done",     hide_low: hideLow, limit: 500 }) });
  const holdingQ  = useQuery({ queryKey: ["items", "triage-count", "holding", hideLow],  queryFn: () => fetchItems({ workflow: "holding",  hide_low: hideLow, limit: 500 }) });
  const skippedQ  = useQuery({ queryKey: ["items", "triage-count", "skipped", hideLow],  queryFn: () => fetchItems({ workflow: "skipped",  hide_low: hideLow, limit: 500 }) });
  const counts: Record<WorkflowStatus, number> = {
    new:      newQ.data?.length      ?? 0,
    triaged:  triagedQ.data?.length  ?? 0,
    done:     doneQ.data?.length     ?? 0,
    holding:  holdingQ.data?.length  ?? 0,
    skipped:  skippedQ.data?.length  ?? 0,
    archived: 0,
  };

  const { data: items = [], isLoading, refetch } = useQuery({
    queryKey: ["items", "triage", activeTab, hideLow],
    queryFn: () => fetchItems({
      workflow: activeTab,
      hide_low: hideLow,
      sort: "published",
      limit: 200,
    }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["items"] });
    refetch();
  };

  return (
    <div style={{ width: "100%" }}>
      <Link to="/vfx" style={{ ...btnGhost, marginBottom: 16 }}>
        <ChevronLeft style={{ width: 14, height: 14 }} /> 대시보드
      </Link>

      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={pageHeadingStyle}>Triage</h1>
          <p style={pageSubtitleStyle}>
            새로 발견 → 배정하면 <b>연구중</b> → 더 안 해도 되면 <b>완료</b>. 관심 없으면 보류·제외.
          </p>
        </div>
      </div>

      {/* 탭 */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{
          display: "flex", gap: 4,
          background: "var(--color-card)", border: "1px solid var(--color-border)",
          borderRadius: 12, padding: 4,
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

        {/* 관련도 낮음(1~6점) 포함/숨김 토글 */}
        <button
          onClick={() => setHideLow((v) => !v)}
          title="Arca 가 1~6점으로 매긴 관련도 낮음 항목"
          style={{
            padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
            border: "1px solid var(--color-border)", cursor: "pointer",
            background: hideLow ? "transparent" : "#fef3c7",
            color: hideLow ? "var(--color-text-muted)" : "#b45309",
            whiteSpace: "nowrap",
          }}
        >
          {hideLow ? "관련도 낮음 숨김 ✓" : "관련도 낮음 표시 중"}
        </button>
      </div>

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
