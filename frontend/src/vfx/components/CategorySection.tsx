import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { fetchItems } from "../api/items";
import type { Category } from "../types";
import ItemCard from "./ItemCard";
import { dedup } from "../utils/dedup";

type Props = {
  category: Category;
};

export default function CategorySection({ category }: Props) {
  const { data: rawItems = [] } = useQuery({
    queryKey: ["items", "category-section", category.slug],
    queryFn: () =>
      fetchItems({
        category: category.slug,
        sort: "discovered",
        limit: 12,
      }),
  });
  const { deduped, groupSources } = useMemo(() => dedup(rawItems), [rawItems]);
  const items = deduped.slice(0, 6);

  if (items.length === 0 && category.item_count === 0) {
    return null;
  }

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <Link
          to={`/category/${category.slug}`}
          className="flex items-center gap-2 group"
        >
          <span className="text-2xl">{category.icon}</span>
          <div>
            <h3 className="text-sm font-semibold text-neutral-100 group-hover:text-brand-300 transition">
              {category.name_ko}
              <span className="text-neutral-500 font-normal ml-2">
                ({category.item_count})
              </span>
            </h3>
            <p className="text-[11px] text-neutral-500">{category.name_en}</p>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          {category.new_this_week > 0 && (
            <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-400">
              +{category.new_this_week} 이번 주
            </span>
          )}
          <Link
            to={`/category/${category.slug}`}
            className="text-xs text-neutral-400 hover:text-brand-300 flex items-center gap-0.5"
          >
            전체 보기
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {category.current_sota.length > 0 && (
        <div className="mb-3 text-[11px] text-neutral-500">
          현재 SOTA: <span className="text-brand-300">⭐ {category.current_sota.join(", ")}</span>
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-800 p-4 text-center text-xs text-neutral-500">
          수집된 아이템이 없습니다
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
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
  );
}
