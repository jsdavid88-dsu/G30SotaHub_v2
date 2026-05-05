import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { searchItems } from "../api/search";
import ItemCard from "../components/ItemCard";
import { dedup } from "../utils/dedup";

export default function SearchResults() {
  const [params] = useSearchParams();
  const q = params.get("q") || "";

  const { data: rawItems = [], isLoading } = useQuery({
    queryKey: ["search", q],
    queryFn: () => searchItems(q),
    enabled: q.length >= 2,
  });
  const { deduped: items, groupSources } = useMemo(() => dedup(rawItems), [rawItems]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">검색 결과</h1>
        <p className="text-sm text-neutral-500 mt-1">
          "{q}" — {isLoading ? "..." : `${items.length}건`}
        </p>
      </div>

      {q.length < 2 ? (
        <div className="rounded-xl border border-dashed border-neutral-800 p-12 text-center text-sm text-neutral-500">
          2자 이상 입력하세요
        </div>
      ) : items.length === 0 && !isLoading ? (
        <div className="rounded-xl border border-dashed border-neutral-800 p-12 text-center text-sm text-neutral-500">
          결과 없음
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
    </div>
  );
}
