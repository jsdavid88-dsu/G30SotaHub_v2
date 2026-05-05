import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, TrendingUp, AlertCircle, Clock } from "lucide-react";
import { fetchCategories } from "../api/categories";
import { fetchSummary } from "../api/stats";
import { fetchItems } from "../api/items";
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
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs text-neutral-500">{label}</div>
          <div className="text-xl font-bold text-neutral-100">{value}</div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });
  const { data: summary } = useQuery({ queryKey: ["summary"], queryFn: fetchSummary });
  const { data: p0Raw = [] } = useQuery({
    queryKey: ["items", { priority: "P0" }],
    queryFn: () => fetchItems({ priority: "P0", limit: 10 }),
  });
  const { deduped: p0Items, groupSources: p0Groups } = useMemo(
    () => dedup(p0Raw),
    [p0Raw],
  );

  const sortedCategories = [...categories].sort((a, b) => {
    if (a.item_count === 0 && b.item_count > 0) return 1;
    if (a.item_count > 0 && b.item_count === 0) return -1;
    return b.item_count - a.item_count;
  });

  const activeCategories = sortedCategories.filter((c) => c.item_count > 0);
  const emptyCategories = sortedCategories.filter((c) => c.item_count === 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">대시보드</h1>
        <p className="text-sm text-neutral-500 mt-1">
          VFX 관련 AI SOTA 실시간 추적 · 마지막 업데이트:{" "}
          {summary?.last_crawl ? new Date(summary.last_crawl).toLocaleString("ko-KR") : "—"}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={TrendingUp}
          label="전체 추적"
          value={summary?.total_items ?? "—"}
          accent="bg-brand-500/20 text-brand-400"
        />
        <StatCard
          icon={Sparkles}
          label="이번 주 신규"
          value={summary?.new_this_week ?? "—"}
          accent="bg-emerald-500/20 text-emerald-400"
        />
        <StatCard
          icon={AlertCircle}
          label="P0 긴급"
          value={summary?.p0_count ?? "—"}
          accent="bg-red-500/20 text-red-400"
        />
        <StatCard
          icon={Clock}
          label="P1 중요"
          value={summary?.p1_count ?? "—"}
          accent="bg-amber-500/20 text-amber-400"
        />
      </div>

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

      {activeCategories.length > 0 && (
        <div className="space-y-4">
          {activeCategories.map((cat) => (
            <CategorySection key={cat.slug} category={cat} />
          ))}
        </div>
      )}

      {emptyCategories.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-neutral-500 uppercase mb-2">
            대기 중 ({emptyCategories.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {emptyCategories.map((cat) => (
              <Link
                key={cat.slug}
                to={`/category/${cat.slug}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-1.5 text-xs text-neutral-400 hover:border-neutral-700"
              >
                <span>{cat.icon}</span>
                <span>{cat.name_ko}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {categories.length === 0 && (
        <div className="rounded-xl border border-dashed border-neutral-800 bg-neutral-900/50 p-12 text-center">
          <p className="text-neutral-500 mb-2">카테고리 데이터가 없습니다</p>
          <p className="text-xs text-neutral-600">
            <code className="rounded bg-neutral-800 px-2 py-1">python seed.py</code> 실행
          </p>
        </div>
      )}
    </div>
  );
}
