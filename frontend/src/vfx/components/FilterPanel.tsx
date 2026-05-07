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
  { value: "WATCH", label: "WATCH" },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "published", label: "발표일 최신순" },
  { value: "published_asc", label: "발표일 오래된순" },
  { value: "discovered", label: "발견 최신순" },
  { value: "discovered_asc", label: "발견 오래된순" },
  { value: "score", label: "LLM 점수순" },
  { value: "keyword_score", label: "키워드 점수순" },
  { value: "priority", label: "우선순위순" },
];

const selectStyle: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 8,
  border: "1px solid var(--color-border)", fontSize: 13,
  background: "#fff", color: "var(--color-text-primary)",
  outline: "none", cursor: "pointer",
};

export default function FilterPanel({ filters, onChange, showCategory = false, categories = [] }: Props) {
  const set = (key: keyof ItemFilters, value: string | number | undefined) => {
    const next = { ...filters };
    if (value === "" || value === undefined) delete next[key];
    else (next as Record<string, unknown>)[key] = value;
    onChange(next);
  };

  return (
    <div style={{
      display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8,
      padding: "12px 16px", borderRadius: 12,
      background: "var(--color-card)", border: "1px solid var(--color-border)",
    }}>
      <select style={selectStyle} value={filters.source ?? ""} onChange={(e) => set("source", e.target.value || undefined)}>
        {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      <select style={selectStyle} value={filters.priority ?? ""} onChange={(e) => set("priority", e.target.value || undefined)}>
        {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
      {showCategory && categories.length > 0 && (
        <select style={selectStyle} value={filters.category ?? ""} onChange={(e) => set("category", e.target.value || undefined)}>
          <option value="">전체 카테고리</option>
          {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name_ko}</option>)}
        </select>
      )}
      <select style={selectStyle} value={filters.sort ?? "published"} onChange={(e) => set("sort", e.target.value as SortKey)}>
        {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <input
        type="number" min={0} max={10} placeholder="최소 점수"
        value={filters.min_score ?? ""}
        onChange={(e) => set("min_score", e.target.value ? Number(e.target.value) : undefined)}
        style={{ ...selectStyle, width: 100 }}
      />
      {(Object.keys(filters).length > 0 && !(Object.keys(filters).length === 1 && filters.sort)) && (
        <button
          onClick={() => onChange(filters.sort ? { sort: filters.sort } : {})}
          style={{
            marginLeft: "auto", padding: "6px 12px", borderRadius: 8,
            background: "transparent", border: "none", cursor: "pointer",
            fontSize: 12, color: "var(--color-text-muted)",
          }}
        >
          필터 초기화
        </button>
      )}
    </div>
  );
}
