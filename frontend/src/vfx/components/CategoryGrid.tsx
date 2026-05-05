import { Link } from "react-router-dom";
import type { Category } from "../types";

export default function CategoryGrid({ categories }: { categories: Category[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
      {categories.map((cat) => (
        <Link
          key={cat.slug}
          to={`/category/${cat.slug}`}
          className="group relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 p-4 hover:border-brand-500/50 transition"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="text-3xl">{cat.icon}</div>
            {cat.new_this_week > 0 && (
              <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-400">
                +{cat.new_this_week}
              </span>
            )}
          </div>
          <h3 className="font-semibold text-sm text-neutral-100 group-hover:text-brand-300 transition">
            {cat.name_ko}
          </h3>
          <p className="text-[11px] text-neutral-500 mt-0.5">{cat.name_en}</p>

          <div className="mt-3 flex items-center justify-between text-[10px]">
            <span className="text-neutral-500">총 {cat.item_count}</span>
            {cat.current_sota.length > 0 && (
              <span className="text-brand-400 truncate max-w-[120px]" title={cat.current_sota[0]}>
                ⭐ {cat.current_sota[0].split(" ")[0]}
              </span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
