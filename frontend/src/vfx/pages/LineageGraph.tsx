import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCategories } from "../api/categories";
import { fetchCategoryLineage } from "../api/lineage";
import LineageFlow from "../components/LineageFlow";

export default function LineageGraph() {
  const [selectedSlug, setSelectedSlug] = useState<string>("");

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  const { data: graph } = useQuery({
    queryKey: ["lineage", "category", selectedSlug],
    queryFn: () => fetchCategoryLineage(selectedSlug),
    enabled: !!selectedSlug,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">기술 계보</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Semantic Scholar 인용 관계 기반. 논문 노드를 클릭해 상세로 이동.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-neutral-400">카테고리:</label>
        <select
          value={selectedSlug}
          onChange={(e) => setSelectedSlug(e.target.value)}
          className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-100"
        >
          <option value="">선택하세요</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.icon} {c.name_ko}
            </option>
          ))}
        </select>
      </div>

      {selectedSlug ? (
        <LineageFlow graph={graph} height={700} />
      ) : (
        <div className="rounded-xl border border-dashed border-neutral-800 bg-neutral-900/50 p-12 text-center text-sm text-neutral-500">
          카테고리를 선택하면 계보 그래프가 표시됩니다
        </div>
      )}
    </div>
  );
}
