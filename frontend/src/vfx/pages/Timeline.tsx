import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchItems } from "../api/items";
import ItemCard from "../components/ItemCard";
import { dedup } from "../utils/dedup";

export default function Timeline() {
  const { data: rawItems = [] } = useQuery({
    queryKey: ["items", "timeline"],
    queryFn: () => fetchItems({ limit: 200 }),
  });
  const { deduped: items, groupSources } = useMemo(() => dedup(rawItems), [rawItems]);

  // 날짜별 그룹핑
  const grouped = items.reduce<Record<string, typeof items>>((acc, item) => {
    const date = new Date(item.discovered_at).toLocaleDateString("ko-KR");
    if (!acc[date]) acc[date] = [];
    acc[date].push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">타임라인</h1>
        <p className="text-sm text-neutral-500 mt-1">발견된 SOTA 이력을 시간순으로 봅니다.</p>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-800 p-12 text-center text-sm text-neutral-500">
          아직 수집된 데이터가 없습니다.
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([date, dateItems]) => (
            <section key={date}>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-2 w-2 rounded-full bg-brand-500" />
                <h2 className="text-sm font-semibold text-neutral-300">{date}</h2>
                <div className="flex-1 h-px bg-neutral-800" />
                <span className="text-xs text-neutral-500">{dateItems.length}건</span>
              </div>
              <div className="ml-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {dateItems.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    groupSources={item.group_id ? groupSources.get(item.group_id) : undefined}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
