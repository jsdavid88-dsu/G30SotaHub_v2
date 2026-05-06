import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles, TrendingUp, AlertCircle, Clock, Database, Zap,
  RefreshCw, GitBranch, Link2, Plus, X, Loader2,
} from "lucide-react";
import { fetchCategories } from "../api/categories";
import { fetchSummary } from "../api/stats";
import { fetchItems } from "../api/items";
import {
  triggerCrawlAll, triggerLinkCodes, triggerBuildLineage,
  createCategory, deleteCategory,
} from "../api/admin";
import CategorySection from "../components/CategorySection";
import ItemCard from "../components/ItemCard";
import { dedup } from "../utils/dedup";

// Hub 디자인 토큰 활용 (--color-card / --color-text-primary 등)

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string; // tailwind color e.g. "indigo" / "emerald" / "rose" / "amber"
}) {
  const ringMap: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-600",
    emerald: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-600",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm hover:shadow-md transition">
      <div className={`inline-flex rounded-xl p-2.5 ${ringMap[color] ?? ringMap.indigo}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-4">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</div>
        <div className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">{value}</div>
      </div>
    </div>
  );
}

// ============================================================================
// AdminToolbar
// ============================================================================
function AdminToolbar() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setMsg(null);
    try {
      await fn();
      setMsg(`${label} 완료 — 1-2분 후 새로고침`);
      setTimeout(() => {
        qc.invalidateQueries();
        setMsg(null);
      }, 5000);
    } catch (e) {
      setMsg(`에러: ${e instanceof Error ? e.message : String(e)}`);
      setTimeout(() => setMsg(null), 5000);
    } finally {
      setBusy(null);
    }
  };

  const Btn = ({ icon: Icon, label, onClick, primary = false }: {
    icon: React.ElementType; label: string; onClick: () => void; primary?: boolean;
  }) => (
    <button
      onClick={onClick}
      disabled={busy !== null}
      className={
        primary
          ? "flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 text-sm font-medium shadow-sm shadow-indigo-600/20 disabled:opacity-50 transition"
          : "flex items-center gap-2 rounded-lg bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 text-sm font-medium disabled:opacity-50 transition"
      }
    >
      {busy === label ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
    </button>
  );

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <Btn icon={RefreshCw} label="전체 수집" onClick={() => run("전체 수집", triggerCrawlAll)} primary />
        <Btn icon={Link2} label="코드 링크" onClick={() => run("코드 링크", triggerLinkCodes)} />
        <Btn icon={GitBranch} label="계보 빌드" onClick={() => run("계보 빌드", triggerBuildLineage)} />
      </div>
      {msg && <div className="text-xs text-slate-500">{msg}</div>}
    </div>
  );
}

// ============================================================================
// AddCategoryModal
// ============================================================================
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
    if (!slug || !nameKo || !nameEn) {
      setErr("slug, 한글명, 영문명 필수");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await createCategory({ slug, name_ko: nameKo, name_en: nameEn, icon, description });
      onCreated();
      onClose();
      setSlug(""); setNameKo(""); setNameEn(""); setIcon(""); setDescription("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="rounded-2xl bg-white border border-slate-200 p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl font-semibold text-slate-900 mb-5">카테고리 추가</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">slug (영문, _)</label>
            <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="motion_capture"
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">한글명</label>
              <input value={nameKo} onChange={(e) => setNameKo(e.target.value)} placeholder="모션 캡처"
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">English</label>
              <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Motion Capture"
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">아이콘 (이모지)</label>
            <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🎬"
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">설명 (선택)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition resize-none" />
          </div>
          {err && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{err}</div>}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">취소</button>
          <button onClick={submit} disabled={busy}
            className="px-5 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/20 disabled:opacity-50">
            {busy ? "추가 중..." : "추가"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// EmptyState
// ============================================================================
function EmptyState() {
  return (
    <div className="rounded-2xl bg-white border-2 border-dashed border-slate-200 p-10">
      <div className="text-center mb-6">
        <div className="inline-flex rounded-2xl bg-indigo-50 p-3 mb-4">
          <Sparkles className="h-8 w-8 text-indigo-500" />
        </div>
        <h3 className="text-xl font-semibold text-slate-900 mb-1">아직 수집된 모델이 없습니다</h3>
        <p className="text-sm text-slate-500">
          분야는 준비됐어요. 두 가지 방법 중 하나로 채울 수 있습니다.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-4 w-4 text-amber-600" />
            <div className="font-semibold text-sm text-slate-900">A. 새로 크롤</div>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            우상단 <span className="font-medium text-indigo-600">[전체 수집]</span> 클릭. arxiv / GitHub / HF / Reddit / X 에서 5-10분 내 채워짐.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Database className="h-4 w-4 text-indigo-600" />
            <div className="font-semibold text-sm text-slate-900">B. 원본 마이그레이션</div>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            <code className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px]">scripts/migrate_vfx_sqlite.py</code> 실행 → 68 items + 210 feeds 즉시 복원.
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Dashboard
// ============================================================================
export default function Dashboard() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });
  const { data: summary } = useQuery({ queryKey: ["summary"], queryFn: fetchSummary });
  const { data: p0Raw = [] } = useQuery({
    queryKey: ["items", { priority: "P0" }],
    queryFn: () => fetchItems({ priority: "P0", limit: 10 }),
  });
  const { deduped: p0Items, groupSources: p0Groups } = useMemo(() => dedup(p0Raw), [p0Raw]);

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
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* 헤딩 */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">VFX SOTA 대시보드</h1>
          <p className="text-base text-slate-500 mt-1.5">
            VFX 관련 AI SOTA 실시간 추적 · 마지막 업데이트{" "}
            <span className="text-slate-700 font-medium">
              {summary?.last_crawl ? new Date(summary.last_crawl).toLocaleString("ko-KR") : "—"}
            </span>
          </p>
        </div>
        <AdminToolbar />
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} label="전체 추적" value={summary?.total_items ?? "—"} color="indigo" />
        <StatCard icon={Sparkles} label="이번 주 신규" value={summary?.new_this_week ?? "—"} color="emerald" />
        <StatCard icon={AlertCircle} label="P0 긴급" value={summary?.p0_count ?? "—"} color="rose" />
        <StatCard icon={Clock} label="P1 중요" value={summary?.p1_count ?? "—"} color="amber" />
      </div>

      {/* 분야 카드 grid */}
      <section>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              분야 <span className="text-slate-400 font-normal">({categories.length})</span>
            </h2>
            <p className="text-sm text-slate-500 mt-1">VFX 추적 분야 — 클릭하면 분야별 모델 모음</p>
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 px-4 py-2 text-sm font-medium text-slate-700 hover:text-indigo-700 transition"
          >
            <Plus className="h-4 w-4" />
            카테고리 추가
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {sortedCategories.map((cat) => (
            <div key={cat.slug} className="group relative">
              <Link
                to={`/vfx/category/${cat.slug}`}
                className="flex flex-col items-center justify-center rounded-2xl bg-white border border-slate-200 hover:border-indigo-400 hover:shadow-md hover:-translate-y-0.5 px-4 py-6 transition-all"
              >
                <span className="text-3xl mb-2.5">{cat.icon || "📂"}</span>
                <span className="text-sm font-semibold text-slate-900 text-center">{cat.name_ko}</span>
                <span className="text-xs text-slate-500 mt-1.5 tabular-nums">{cat.item_count} 모델</span>
              </Link>
              <button
                onClick={() => onDelete(cat.slug, cat.name_ko)}
                title="삭제"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 rounded-md bg-white border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 빈 상태 */}
      {isEmpty && <EmptyState />}

      {/* P0 긴급 */}
      {p0Items.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-rose-600 mb-4 flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            긴급 (P0)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {p0Items.slice(0, 5).map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                groupSources={item.group_id ? p0Groups.get(item.group_id) : undefined}
              />
            ))}
          </div>
        </section>
      )}

      {/* 활성 카테고리 */}
      {activeCategories.length > 0 && (
        <div className="space-y-6">
          {activeCategories.map((cat) => (
            <CategorySection key={cat.slug} category={cat} />
          ))}
        </div>
      )}

      <AddCategoryModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => qc.invalidateQueries({ queryKey: ["categories"] })}
      />
    </div>
  );
}
