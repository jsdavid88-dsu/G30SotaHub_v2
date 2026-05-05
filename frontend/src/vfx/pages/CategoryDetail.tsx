import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { fetchCategory } from "../api/categories";
import { fetchItems, type ItemFilters } from "../api/items";
import ItemCard from "../components/ItemCard";
import FilterPanel from "../components/FilterPanel";
import { dedup } from "../utils/dedup";

export default function CategoryDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [filters, setFilters] = useState<ItemFilters>({ sort: "discovered" });

  const { data: category } = useQuery({
    queryKey: ["category", slug],
    queryFn: () => fetchCategory(slug!),
    enabled: !!slug,
  });
  const { data: rawItems = [] } = useQuery({
    queryKey: ["items", { category: slug, ...filters }],
    queryFn: () => fetchItems({ ...filters, category: slug, limit: 200 }),
    enabled: !!slug,
  });
  const { deduped: items, groupSources } = useMemo(() => dedup(rawItems), [rawItems]);

  if (!category) {
    return <div className="text-neutral-500">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-100"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> 대시보드
      </Link>

      <header className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <div className="flex items-start gap-4">
          <div className="text-5xl">{category.icon}</div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{category.name_ko}</h1>
            <p className="text-sm text-neutral-500 mt-0.5">{category.name_en}</p>
            {category.description && (
              <p className="text-sm text-neutral-400 mt-2">{category.description}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="text-2xl font-bold text-brand-400">{category.item_count}</div>
            <div className="text-[10px] text-neutral-500">총 아이템</div>
            {category.new_this_week > 0 && (
              <div className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-400">
                +{category.new_this_week} 이번 주
              </div>
            )}
          </div>
        </div>

        {category.current_sota.length > 0 && (
          <div className="mt-4 pt-4 border-t border-neutral-800">
            <div className="text-[10px] font-semibold text-neutral-500 uppercase mb-2">
              현재 SOTA
            </div>
            <div className="flex flex-wrap gap-2">
              {category.current_sota.map((sota) => (
                <span
                  key={sota}
                  className="rounded-md border border-brand-500/30 bg-brand-500/10 px-2 py-1 text-xs text-brand-300"
                >
                  ⭐ {sota}
                </span>
              ))}
            </div>
          </div>
        )}
      </header>

      <FilterPanel filters={filters} onChange={setFilters} />

      <section>
        <h2 className="text-sm font-semibold text-neutral-300 mb-3">
          발견 이력 ({items.length})
        </h2>
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-800 p-8 text-center text-sm text-neutral-500">
            조건에 맞는 아이템이 없습니다
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                groupSources={item.group_id ? groupSources.get(item.group_id) : undefined}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
