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

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-900 to-neutral-950 p-5 hover:border-neutral-700 transition">
      <div className="flex items-start justify-between">
        <div className={`rounded-xl p-2.5 ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-4">
        <div className="text-xs text-neutral-500 uppercase tracking-wider">{label}</div>
        <div className="text-3xl font-bold text-neutral-100 mt-1 tabular-nums">{value}</div>
      </div>
    </div>
  );
}

// ============================================================================
// AdminToolbar — Dashboard 우상단의 액션 버튼 그룹
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

  const Btn = ({ icon: Icon, label, onClick, accent = "" }: {
    icon: React.ElementType; label: string; onClick: () => void; accent?: string;
  }) => (
    <button
      onClick={onClick}
      disabled={busy !== null}
      className={`flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 disabled:opacity-50 ${accent}`}
    >
      {busy === label ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <Btn icon={RefreshCw} label="전체 수집" onClick={() => run("전체 수집", triggerCrawlAll)} accent="border-brand-700/50 text-brand-300" />
        <Btn icon={Link2} label="코드 링크" onClick={() => run("코드 링크", triggerLinkCodes)} />
        <Btn icon={GitBranch} label="계보 빌드" onClick={() => run("계보 빌드", triggerBuildLineage)} />
      </div>
      {msg && <div className="text-[10px] text-neutral-400">{msg}</div>}
    </div>
  );
}

// ============================================================================
// AddCategoryModal — 카테고리 추가 모달 (admin/professor)
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">카테고리 추가</h3>
        <div className="space-y-3 text-sm">
          <div>
            <label className="text-xs text-neutral-500">slug (영문, _)</label>
            <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="예: motion_capture"
              className="w-full mt-1 px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-100" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500">한글명</label>
              <input value={nameKo} onChange={(e) => setNameKo(e.target.value)} placeholder="모션 캡처"
                className="w-full mt-1 px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-100" />
            </div>
            <div>
              <label className="text-xs text-neutral-500">English</label>
              <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Motion Capture"
                className="w-full mt-1 px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-100" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500">아이콘 (이모지)</label>
              <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🎬"
                className="w-full mt-1 px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-100" />
            </div>
          </div>
          <div>
            <label className="text-xs text-neutral-500">설명 (선택)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-100 text-xs" />
          </div>
          {err && <div className="text-xs text-red-400">{err}</div>}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200">취소</button>
          <button onClick={submit} disabled={busy}
            className="px-4 py-1.5 text-sm rounded-lg bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-50">
            {busy ? "추가 중..." : "추가"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// EmptyState — 데이터 0 일 때
// ============================================================================
function EmptyState({ categoryCount }: { categoryCount: number }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-neutral-800 bg-neutral-900/40 p-10 mt-4">
      <div className="text-center mb-6">
        <Sparkles className="h-10 w-10 mx-auto text-brand-400/60 mb-3" />
        <h3 className="text-lg font-semibold text-neutral-100 mb-1">아직 수집된 모델이 없습니다</h3>
        <p className="text-sm text-neutral-500">
          {categoryCount}개 분야 준비됨 · 우상단 [전체 수집] 버튼 또는 마이그레이션
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl mx-auto">
        <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-4 w-4 text-amber-400" />
            <div className="font-semibold text-sm">A. 새로 크롤</div>
          </div>
          <p className="text-xs text-neutral-500">우상단 [전체 수집] 클릭. 5-10분 후 채워짐.</p>
        </div>
        <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Database className="h-4 w-4 text-brand-400" />
            <div className="font-semibold text-sm">B. 원본 마이그레이션</div>
          </div>
          <p className="text-xs text-neutral-500">vfx-sota-monitor SQLite (68 items + 210 feeds) 복원.</p>
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
  const emptyCategories = sortedCategories.filter((c) => c.item_count === 0);
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
      {/* 헤딩 + Admin 툴바 */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">대시보드</h1>
          <p className="text-base text-neutral-400 mt-2">
            VFX 관련 AI SOTA 실시간 추적 · 마지막 업데이트{" "}
            <span className="text-neutral-300">
              {summary?.last_crawl ? new Date(summary.last_crawl).toLocaleString("ko-KR") : "—"}
            </span>
          </p>
        </div>
        <AdminToolbar />
      </div>

      {/* 통계 카드 — 더 큰 카드, 그라디언트 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} label="전체 추적" value={summary?.total_items ?? "—"} accent="bg-brand-500/20 text-brand-300" />
        <StatCard icon={Sparkles} label="이번 주 신규" value={summary?.new_this_week ?? "—"} accent="bg-emerald-500/20 text-emerald-300" />
        <StatCard icon={AlertCircle} label="P0 긴급" value={summary?.p0_count ?? "—"} accent="bg-red-500/20 text-red-300" />
        <StatCard icon={Clock} label="P1 중요" value={summary?.p1_count ?? "—"} accent="bg-amber-500/20 text-amber-300" />
      </div>

      {/* 분야 (카테고리) 관리 — 카드 grid */}
      <section>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">분야 <span className="text-neutral-500 font-normal">({categories.length})</span></h2>
            <p className="text-xs text-neutral-500 mt-1">VFX 추적 분야 — 클릭하면 분야별 모델 모음</p>
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-brand-700/40 bg-brand-600/10 hover:bg-brand-600/20 px-4 py-2 text-sm text-brand-300 transition"
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
                className="flex flex-col items-center justify-center rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-900 to-neutral-950 hover:border-brand-500/50 hover:shadow-lg hover:shadow-brand-500/10 px-4 py-5 transition"
              >
                <span className="text-3xl mb-2">{cat.icon || "📂"}</span>
                <span className="text-sm font-medium text-neutral-200 text-center">{cat.name_ko}</span>
                <span className="text-xs text-neutral-500 mt-1.5 tabular-nums">{cat.item_count} 모델</span>
              </Link>
              <button
                onClick={() => onDelete(cat.slug, cat.name_ko)}
                title="삭제"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 rounded-md bg-neutral-900/80 text-neutral-500 hover:text-red-400 hover:bg-red-500/20 transition"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 빈 상태 */}
      {isEmpty && <EmptyState categoryCount={categories.length} />}

      {/* P0 긴급 */}
      {p0Items.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
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

      {/* 활성 카테고리 (item_count > 0) */}
      {activeCategories.length > 0 && (
        <div className="space-y-4">
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
