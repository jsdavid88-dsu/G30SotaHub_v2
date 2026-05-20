// VFX Dashboard — Hub design language 따름.
// inline style + var(--color-*) + Noto Serif KR 헤딩 + 16px radius + 미묘한 shadow.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles, TrendingUp, AlertCircle, Clock, Database, Zap,
  RefreshCw, GitBranch, Link2, Plus, X, Loader2, Brain,
} from "lucide-react";
import { fetchCategories } from "../api/categories";
import { fetchSummary } from "../api/stats";
import { fetchItems } from "../api/items";
import {
  triggerCrawlAll, triggerLinkCodes, triggerBuildLineage, triggerNightBatch,
  createCategory, deleteCategory,
} from "../api/admin";
import CategorySection from "../components/CategorySection";
import ItemCard from "../components/ItemCard";
import ItemTable from "../components/ItemTable";
import ViewToggle from "../components/ViewToggle";
import AssignModal, { type AssignModalState } from "../components/AssignModal";
import { useViewMode } from "../utils/viewMode";
import { dedup } from "../utils/dedup";

// ─── Hub design tokens (inline) ───
const cardStyle: React.CSSProperties = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: "16px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
};

const sectionHeaderStyle: React.CSSProperties = {
  padding: "20px 28px",
  borderBottom: "1px solid #f1f5f9",
};

const sectionTitleStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: "17px",
  color: "var(--color-text-primary)",
};

const sectionSubtitleStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "var(--color-text-muted)",
  marginTop: "4px",
};

const btnPrimary: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600,
  background: "var(--color-accent)", color: "#fff",
  border: "none", cursor: "pointer",
  transition: "all 0.15s",
};

const btnSecondary: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 500,
  background: "#fff", color: "var(--color-text-secondary)",
  border: "1px solid var(--color-border)", cursor: "pointer",
  transition: "all 0.15s",
};

// ─── StatCard (Hub style) ───
function StatCard({ icon: Icon, label, value, accentBg, accentColor }: {
  icon: React.ElementType; label: string; value: string | number;
  accentBg: string; accentColor: string;
}) {
  return (
    <div style={{ ...cardStyle, padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: accentBg,
        }}>
          <Icon style={{ width: 20, height: 20, color: accentColor }} />
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color: "var(--color-text-primary)", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

// ─── AdminToolbar ───
function AdminToolbar() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async (label: string, fn: () => Promise<unknown>, hint: string) => {
    setBusy(label); setMsg(null);
    try {
      await fn();
      setMsg(`${label} 시작됨 — ${hint}`);
      setTimeout(() => { qc.invalidateQueries(); setMsg(null); }, 8000);
    } catch (e) {
      setMsg(`에러: ${e instanceof Error ? e.message : String(e)}`);
      setTimeout(() => setMsg(null), 5000);
    } finally { setBusy(null); }
  };

  const Btn = ({ icon: Icon, label, onClick, primary = false }: {
    icon: React.ElementType; label: string; onClick: () => void; primary?: boolean;
  }) => (
    <button
      onClick={onClick}
      disabled={busy !== null}
      style={{ ...(primary ? btnPrimary : btnSecondary), opacity: busy !== null ? 0.5 : 1 }}
    >
      {busy === label ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Icon style={{ width: 14, height: 14 }} />}
      {label}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <Btn
          icon={Brain}
          label="야간 배치 (Gemma 분석)"
          onClick={() => run("야간 배치", triggerNightBatch, "5-30분 진행 (Gemma 4 분석 + 그룹핑 + 승격 검토). 백엔드 콘솔에서 진행 확인.")}
          primary
        />
        <Btn icon={RefreshCw} label="빠른 수집" onClick={() => run("빠른 수집", triggerCrawlAll, "1-2분 진행. 키워드 매칭만 (LLM 분석 X). 새로고침해서 카운트 확인.")} />
        <Btn icon={Link2} label="코드 링크" onClick={() => run("코드 링크", triggerLinkCodes, "arxiv ↔ GitHub 매칭. 1분 진행.")} />
        <Btn icon={GitBranch} label="계보 빌드" onClick={() => run("계보 빌드", triggerBuildLineage, "Semantic Scholar 인용 그래프. 2-5분 진행.")} />
      </div>
      {msg && (
        <div style={{
          fontSize: 12, color: "var(--color-text-secondary)",
          maxWidth: 480, textAlign: "right", lineHeight: 1.5,
        }}>
          {msg}
        </div>
      )}
    </div>
  );
}

// ─── AddCategoryModal ───
function AddCategoryModal({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: () => void;
}) {
  const [slug, setSlug] = useState("");
  const [nameKo, setNameKo] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [icon, setIcon] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!slug || !nameKo || !nameEn) { setErr("slug, 한글명, 영문명 필수"); return; }
    setBusy(true); setErr(null);
    try {
      await createCategory({ slug, name_ko: nameKo, name_en: nameEn, icon, description });
      onCreated(); onClose();
      setSlug(""); setNameKo(""); setNameEn(""); setIcon(""); setDescription("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  if (!open) return null;
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: 10,
    border: "1px solid var(--color-border)", fontSize: 14,
    background: "#fff", color: "var(--color-text-primary)",
    outline: "none", transition: "border-color 0.15s",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 6,
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 50,
      background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        ...cardStyle, padding: 28, width: "100%", maxWidth: 480,
        boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
      }}>
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 20 }}>
          카테고리 추가
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={labelStyle}>slug (영문, _)</label>
            <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="motion_capture" style={inputStyle} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>한글명</label>
              <input value={nameKo} onChange={(e) => setNameKo(e.target.value)} placeholder="모션 캡처" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>English</label>
              <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Motion Capture" style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>아이콘 (이모지)</label>
            <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🎬" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>설명 (선택)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              style={{ ...inputStyle, resize: "none", fontFamily: "inherit" }} />
          </div>
          {err && (
            <div style={{
              padding: "10px 14px", borderRadius: 10,
              background: "var(--color-danger-light)", color: "var(--color-danger)",
              fontSize: 13,
            }}>{err}</div>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>
          <button onClick={onClose} style={{
            padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 500,
            background: "transparent", color: "var(--color-text-secondary)",
            border: "none", cursor: "pointer",
          }}>취소</button>
          <button onClick={submit} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.5 : 1 }}>
            {busy ? "추가 중..." : "추가"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── EmptyState ───
function EmptyState() {
  const subCardStyle: React.CSSProperties = {
    padding: 20, borderRadius: 12, background: "#f8fafc",
    border: "1px solid var(--color-border)",
  };
  return (
    <div style={{ ...cardStyle, padding: 32, borderStyle: "dashed", borderWidth: 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: "var(--color-accent-light)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Sparkles style={{ width: 28, height: 28, color: "var(--color-accent)" }} />
        </div>
        <div>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)" }}>
            아직 수집된 모델이 없습니다
          </h3>
          <p style={{ fontSize: 14, color: "var(--color-text-muted)", marginTop: 4 }}>
            분야는 준비됐어요. 두 가지 방법 중 하나로 채울 수 있습니다.
          </p>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={subCardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Zap style={{ width: 16, height: 16, color: "var(--color-warning)" }} />
            <div style={{ fontWeight: 600, fontSize: 14, color: "var(--color-text-primary)" }}>A. 새로 크롤</div>
          </div>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
            우상단 <span style={{ fontWeight: 600, color: "var(--color-accent)" }}>[전체 수집]</span> 클릭. arxiv / GitHub / HF / Reddit / X 에서 5-10분 내 채워짐.
          </p>
        </div>
        <div style={subCardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Database style={{ width: 16, height: 16, color: "var(--color-accent)" }} />
            <div style={{ fontWeight: 600, fontSize: 14, color: "var(--color-text-primary)" }}>B. 원본 마이그레이션</div>
          </div>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
            <code style={{ background: "#e2e8f0", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>scripts/migrate_vfx_sqlite.py</code> 실행 → 68 items + 210 feeds 즉시 복원.
          </p>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════
// Dashboard
// ════════════════════════════════════════
export default function Dashboard() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [viewMode] = useViewMode();
  const [assignModal, setAssignModal] = useState<AssignModalState>(null);

  const refreshItems = () => qc.invalidateQueries({ queryKey: ["items"] });

  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const { data: summary } = useQuery({ queryKey: ["summary"], queryFn: fetchSummary });
  // 발표일 우선 정렬 (사용자 요청)
  const { data: p0Raw = [] } = useQuery({
    queryKey: ["items", { priority: "P0", sort: "published" }],
    queryFn: () => fetchItems({ priority: "P0", sort: "published", limit: 10 }),
  });
  const { deduped: p0Items, groupSources: p0Groups } = useMemo(() => dedup(p0Raw), [p0Raw]);

  // Triage 대기 중 (status='new') 카운트
  const { data: triageQueue = [] } = useQuery({
    queryKey: ["items", { workflow: "new", count: true }],
    queryFn: () => fetchItems({ workflow: "new", limit: 500 }),
  });

  const sortedCategories = [...categories].sort((a, b) => {
    if (a.item_count === 0 && b.item_count > 0) return 1;
    if (a.item_count > 0 && b.item_count === 0) return -1;
    return b.item_count - a.item_count;
  });
  const activeCategories = sortedCategories.filter((c) => c.item_count > 0);
  const isEmpty = categories.length > 0 && (summary?.total_items ?? 0) === 0 && p0Items.length === 0;

  const onDelete = async (slug: string, name: string) => {
    if (!confirm(`'${name}' 카테고리 삭제? 매핑된 items 도 분리됨.`)) return;
    try {
      await deleteCategory(slug);
      qc.invalidateQueries({ queryKey: ["categories"] });
    } catch (e) {
      alert(`삭제 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div style={{ width: "100%" }}>
      {/* Greeting (Hub Dashboard 패턴) */}
      <div style={{ marginBottom: 32, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 600, color: "var(--color-text-primary)", fontFamily: "var(--font-display)" }}>
            VFX SOTA 대시보드
          </h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: 15, marginTop: 6, lineHeight: 1.5 }}>
            VFX 관련 AI SOTA 실시간 추적 · 마지막 업데이트{" "}
            <span style={{ color: "var(--color-text-secondary)", fontWeight: 500 }}>
              {summary?.last_crawl ? new Date(summary.last_crawl).toLocaleString("ko-KR") : "—"}
            </span>
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)", fontWeight: 500 }}>뷰</span>
            <ViewToggle />
          </div>
          <AdminToolbar />
        </div>
      </div>

      {/* 통계 카드 */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 16, marginBottom: 32,
      }}>
        <StatCard icon={TrendingUp} label="전체 추적" value={summary?.total_items ?? "—"}
          accentBg="var(--color-accent-light)" accentColor="var(--color-accent)" />
        <StatCard icon={Sparkles} label="이번 주 신규" value={summary?.new_this_week ?? "—"}
          accentBg="var(--color-success-light)" accentColor="var(--color-success)" />
        <StatCard icon={AlertCircle} label="P0 긴급" value={summary?.p0_count ?? "—"}
          accentBg="var(--color-danger-light)" accentColor="var(--color-danger)" />
        <StatCard icon={Clock} label="P1 중요" value={summary?.p1_count ?? "—"}
          accentBg="var(--color-warning-light)" accentColor="var(--color-warning)" />
      </div>

      {/* Triage 큐 — 분류 대기 중인 항목 바로가기 */}
      {triageQueue.length > 0 && (
        <Link
          to="/vfx/triage"
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "16px 24px", marginBottom: 24,
            background: "linear-gradient(135deg, rgba(79,70,229,0.06), rgba(79,70,229,0.02))",
            border: "1px solid #c7d2fe",
            borderRadius: 12,
            textDecoration: "none",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--color-accent)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "#c7d2fe"; }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: "var(--color-accent)", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums",
            }}>
              {triageQueue.length}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>
                분류 대기 중인 새 모델 {triageQueue.length}건
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
                배정 / 보류 / 스킵 / 모터헤드 진행 — 한 줄씩 빠르게 처리
              </div>
            </div>
          </div>
          <span style={{
            padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: "var(--color-accent)", color: "#fff",
          }}>
            Triage 시작 →
          </span>
        </Link>
      )}

      {/* 분야 섹션 — Hub section pattern */}
      <div style={{ ...cardStyle, marginBottom: 24, overflow: "hidden" }}>
        <div style={{ ...sectionHeaderStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={sectionTitleStyle}>
              분야 <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>({categories.length})</span>
            </div>
            <div style={sectionSubtitleStyle}>VFX 추적 분야 — 클릭하면 분야별 모델 모음</div>
          </div>
          <button onClick={() => setAddOpen(true)} style={btnSecondary}>
            <Plus style={{ width: 14, height: 14 }} />
            카테고리 추가
          </button>
        </div>
        <div style={{
          padding: "20px 28px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 12,
        }}>
          {sortedCategories.map((cat) => (
            <CategoryCard key={cat.slug} cat={cat} onDelete={onDelete} />
          ))}
        </div>
      </div>

      {/* 빈 상태 */}
      {isEmpty && <EmptyState />}

      {/* P0 긴급 */}
      {p0Items.length > 0 && (
        <div style={{ ...cardStyle, marginTop: 24, overflow: "hidden" }}>
          <div style={sectionHeaderStyle}>
            <div style={{ ...sectionTitleStyle, color: "var(--color-danger)", display: "flex", alignItems: "center", gap: 8 }}>
              <AlertCircle style={{ width: 18, height: 18 }} />
              긴급 (P0)
            </div>
          </div>
          {viewMode === "table" ? (
            <div style={{ padding: 16 }}>
              <ItemTable
                items={p0Items}
                sortKey="published_at"
                sortDir="desc"
                showActions
                onActionDone={refreshItems}
                onRequestAssign={(itemId, mode) => setAssignModal({ itemId, mode })}
              />
            </div>
          ) : (
            <div style={{ padding: "20px 28px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {p0Items.slice(0, 6).map((item) => (
                <ItemCard key={item.id} item={item} groupSources={item.group_id ? p0Groups.get(item.group_id) : undefined} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 활성 카테고리들 */}
      {activeCategories.length > 0 && (
        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 24 }}>
          {activeCategories.map((cat) => (
            <CategorySection
              key={cat.slug}
              category={cat}
              onRequestAssign={(req) => setAssignModal(req)}
            />
          ))}
        </div>
      )}

      <AssignModal
        state={assignModal}
        onClose={() => setAssignModal(null)}
        onDone={refreshItems}
      />

      <AddCategoryModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => qc.invalidateQueries({ queryKey: ["categories"] })}
      />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function CategoryCard({ cat, onDelete }: { cat: any; onDelete: (slug: string, name: string) => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Link
        to={`/vfx/category/${cat.slug}`}
        style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "20px 12px", borderRadius: 12,
          border: `1px solid ${hover ? "var(--color-accent)" : "var(--color-border)"}`,
          background: "#fff",
          textDecoration: "none",
          boxShadow: hover ? "0 4px 12px rgba(79,70,229,0.12)" : "none",
          transform: hover ? "translateY(-2px)" : "none",
          transition: "all 0.18s",
        }}
      >
        <span style={{ fontSize: 28, marginBottom: 8 }}>{cat.icon || "📂"}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", textAlign: "center" }}>
          {cat.name_ko}
        </span>
        <span style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
          {cat.item_count} 모델
        </span>
      </Link>
      {hover && (
        <button
          onClick={() => onDelete(cat.slug, cat.name_ko)}
          title="삭제"
          style={{
            position: "absolute", top: 6, right: 6,
            width: 24, height: 24, borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "#fff", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--color-text-muted)",
          }}
        >
          <X style={{ width: 12, height: 12 }} />
        </button>
      )}
    </div>
  );
}
