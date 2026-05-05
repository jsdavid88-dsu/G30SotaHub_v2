import type { ItemFilters, SortKey } from "../api/items";

type Props = {
  filters: ItemFilters;
  onChange: (next: ItemFilters) => void;
  showCategory?: boolean;
  categories?: { slug: string; name_ko: string }[];
};

const SOURCES = [
  { value: "", label: "전체 소스" },
  { value: "arxiv", label: "arXiv" },
  { value: "github", label: "GitHub" },
  { value: "huggingface", label: "HuggingFace" },
  { value: "reddit", label: "Reddit" },
  { value: "x", label: "X" },
];

const PRIORITIES = [
  { value: "", label: "전체 우선순위" },
  { value: "P0", label: "P0 (긴급)" },
  { value: "P1", label: "P1 (중요)" },
  { value: "P2", label: "P2 (보통)" },
  { value: "P3", label: "P3 (장기)" },
  { value: "WATCH", label: "WATCH (모니터)" },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "discovered", label: "발견 최신순" },
  { value: "discovered_asc", label: "발견 오래된순" },
  { value: "published", label: "게시 최신순" },
  { value: "score", label: "LLM 점수순" },
  { value: "keyword_score", label: "키워드 점수순" },
  { value: "priority", label: "우선순위순" },
];

export default function FilterPanel({
  filters,
  onChange,
  showCategory = false,
  categories = [],
}: Props) {
  const set = (key: keyof ItemFilters, value: string | number | undefined) => {
    const next = { ...filters };
    if (value === "" || value === undefined) {
      delete next[key];
    } else {
      (next as Record<string, unknown>)[key] = value;
    }
    onChange(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <select
        className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-100"
        value={filters.source ?? ""}
        onChange={(e) => set("source", e.target.value || undefined)}
      >
        {SOURCES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      <select
        className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-100"
        value={filters.priority ?? ""}
        onChange={(e) => set("priority", e.target.value || undefined)}
      >
        {PRIORITIES.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>

      {showCategory && categories.length > 0 && (
        <select
          className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-100"
          value={filters.category ?? ""}
          onChange={(e) => set("category", e.target.value || undefined)}
        >
          <option value="">전체 카테고리</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name_ko}
            </option>
          ))}
        </select>
      )}

      <select
        className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-100"
        value={filters.sort ?? "discovered"}
        onChange={(e) => set("sort", e.target.value as SortKey)}
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <input
        type="number"
        min={0}
        max={10}
        placeholder="최소 점수"
        className="w-20 rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-100"
        value={filters.min_score ?? ""}
        onChange={(e) => {
          const v = e.target.value ? Number(e.target.value) : undefined;
          set("min_score", v);
        }}
      />

      {(Object.keys(filters).length > 0 && !(Object.keys(filters).length === 1 && filters.sort)) && (
        <button
          onClick={() => onChange(filters.sort ? { sort: filters.sort } : {})}
          className="text-xs text-neutral-400 hover:text-neutral-100 ml-auto"
        >
          필터 초기화
        </button>
      )}
    </div>
  );
}
