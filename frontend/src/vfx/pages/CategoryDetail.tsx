import { useState, useMemo, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { fetchCategory } from "../api/categories";
import { fetchItems, type ItemFilters, type SortKey as ApiSortKey } from "../api/items";
import ItemCard from "../components/ItemCard";
import ItemTable, { type SortKey as TableSortKey, type SortDir } from "../components/ItemTable";
import FilterPanel from "../components/FilterPanel";
import ViewToggle from "../components/ViewToggle";
import AssignModal, { type AssignModalState } from "../components/AssignModal";
import CategoryKeywordsEditor from "../components/CategoryKeywordsEditor";
import { useViewMode } from "../utils/viewMode";
import { dedup } from "../utils/dedup";
import { cardStyle, sectionHeaderStyle, sectionTitleStyle, badgeStyle, btnGhost } from "../design";

// table 컬럼 클릭 시 backend sort 키로 변환
const TABLE_SORT_TO_API: Record<TableSortKey, ApiSortKey | null> = {
  title: null,           // backend 미지원 — client-side
  source: null,          // client-side
  published_at: "published",
  discovered_at: "discovered",
  priority: "priority",
  score: "score",
  assignee: null,        // client-side
  lifecycle: null,       // client-side
};

export default function CategoryDetail() {
  const { slug } = useParams<{ slug: string }>();
  const qc = useQueryClient();
  // default 정렬을 'published' 로 (사용자 요청 — 발표일 우선)
  const [filters, setFilters] = useState<ItemFilters>({ sort: "published" });
  const [viewMode] = useViewMode();
  const [tableSort, setTableSort] = useState<{ key: TableSortKey; dir: SortDir }>({ key: "published_at", dir: "desc" });
  const [assignModal, setAssignModal] = useState<AssignModalState>(null);

  const refreshItems = () => {
    qc.invalidateQueries({ queryKey: ["items"] });
  };

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

  // table 컬럼 헤더 클릭 처리
  const handleTableSort = useCallback((key: TableSortKey) => {
    const apiKey = TABLE_SORT_TO_API[key];
    setTableSort((prev) => {
      const sameKey = prev.key === key;
      const nextDir: SortDir = sameKey && prev.dir === "desc" ? "asc" : "desc";
      // backend 가 지원하는 키면 server-sort, 아니면 client-sort 만 (현재는 server 만 처리)
      if (apiKey) {
        const apiSort: ApiSortKey =
          key === "published_at" && nextDir === "asc" ? "discovered_asc" :  // backend 에 published_asc 가 없음 — fallback
          key === "discovered_at" && nextDir === "asc" ? "discovered_asc" :
          apiKey;
        // 단, backend 의 published 정렬은 desc 만 있음. asc 면 client-side 보강 필요.
        // 일단 단순화: published_at + asc = published 그대로 + client reverse
        setFilters((f) => ({ ...f, sort: apiSort }));
      }
      return { key, dir: nextDir };
    });
  }, []);

  // client-side 보조 정렬 (asc 또는 backend 미지원 컬럼)
  const sortedItems = useMemo(() => {
    if (viewMode !== "table") return items;
    const arr = [...items];
    const { key, dir } = tableSort;
    const mul = dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let av: any, bv: any;
      switch (key) {
        case "title": av = a.title.toLowerCase(); bv = b.title.toLowerCase(); break;
        case "source": av = a.source; bv = b.source; break;
        case "published_at": av = a.published_at ? new Date(a.published_at).getTime() : 0; bv = b.published_at ? new Date(b.published_at).getTime() : 0; break;
        case "discovered_at": av = new Date(a.discovered_at).getTime(); bv = new Date(b.discovered_at).getTime(); break;
        case "priority": av = a.priority ?? "Z"; bv = b.priority ?? "Z"; break;
        case "score": av = a.llm_score || a.keyword_score; bv = b.llm_score || b.keyword_score; break;
        case "assignee": {
          const aa = (a.assignments?.[0]?.assignee_name) ?? "";
          const bb = (b.assignments?.[0]?.assignee_name) ?? "";
          av = aa; bv = bb; break;
        }
        case "lifecycle": av = a.lifecycle_status ?? ""; bv = b.lifecycle_status ?? ""; break;
        default: av = 0; bv = 0;
      }
      if (av < bv) return -1 * mul;
      if (av > bv) return 1 * mul;
      return 0;
    });
    return arr;
  }, [items, tableSort, viewMode]);

  if (!category) return <div style={{ color: "var(--color-text-muted)" }}>Loading...</div>;

  return (
    <div style={{ width: "100%" }}>
      <Link to="/vfx" style={{ ...btnGhost, marginBottom: 16 }}>
        <ChevronLeft style={{ width: 14, height: 14 }} /> 대시보드
      </Link>

      <div style={{ ...cardStyle, padding: 28, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
          <div style={{ fontSize: 56 }}>{category.icon}</div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 600, color: "var(--color-text-primary)" }}>
              {category.name_ko}
            </h1>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 2 }}>{category.name_en}</p>
            {category.description && (
              <p style={{ fontSize: 14, color: "var(--color-text-secondary)", marginTop: 12, lineHeight: 1.6 }}>
                {category.description}
              </p>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--color-accent)" }}>{category.item_count}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>총 아이템</div>
            {category.new_this_week > 0 && (
              <span style={badgeStyle("var(--color-danger-light)", "var(--color-danger)")}>
                +{category.new_this_week} 이번 주
              </span>
            )}
          </div>
        </div>

        {category.current_sota.length > 0 && (
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid #f1f5f9" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
              현재 SOTA
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {category.current_sota.map((sota) => (
                <span key={sota} style={{
                  padding: "6px 12px", borderRadius: 8, fontSize: 13,
                  background: "var(--color-accent-light)", color: "var(--color-accent-dark)",
                  fontWeight: 500,
                }}>
                  ⭐ {sota}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <CategoryKeywordsEditor
        category={category}
        onSaved={() => qc.invalidateQueries({ queryKey: ["category", slug] })}
      />

      <div style={{ marginBottom: 16 }}>
        <FilterPanel filters={filters} onChange={setFilters} />
      </div>

      <div style={{ ...cardStyle, overflow: "hidden" }}>
        <div style={{ ...sectionHeaderStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={sectionTitleStyle}>
            발견 이력 <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>({items.length})</span>
          </div>
          <ViewToggle />
        </div>
        <div style={{ padding: viewMode === "table" ? 16 : 20 }}>
          {items.length === 0 ? (
            <div style={{
              padding: 32, textAlign: "center", fontSize: 13,
              color: "var(--color-text-muted)",
              border: "1px dashed var(--color-border)", borderRadius: 12,
            }}>
              조건에 맞는 아이템이 없습니다
            </div>
          ) : viewMode === "table" ? (
            <ItemTable
              items={sortedItems}
              sortKey={tableSort.key}
              sortDir={tableSort.dir}
              onSort={handleTableSort}
              showActions
              onActionDone={refreshItems}
              onRequestAssign={(itemId, mode) => setAssignModal({ itemId, mode })}
            />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
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
      </div>

      <AssignModal
        state={assignModal}
        onClose={() => setAssignModal(null)}
        onDone={refreshItems}
      />
    </div>
  );
}
