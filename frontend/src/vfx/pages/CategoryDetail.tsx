import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { fetchCategory } from "../api/categories";
import { fetchItems, type ItemFilters } from "../api/items";
import ItemCard from "../components/ItemCard";
import FilterPanel from "../components/FilterPanel";
import { dedup } from "../utils/dedup";
import { cardStyle, sectionHeaderStyle, sectionTitleStyle, badgeStyle, btnGhost } from "../design";

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

      <div style={{ marginBottom: 16 }}>
        <FilterPanel filters={filters} onChange={setFilters} />
      </div>

      <div style={{ ...cardStyle, overflow: "hidden" }}>
        <div style={sectionHeaderStyle}>
          <div style={sectionTitleStyle}>
            발견 이력 <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>({items.length})</span>
          </div>
        </div>
        <div style={{ padding: 20 }}>
          {items.length === 0 ? (
            <div style={{
              padding: 32, textAlign: "center", fontSize: 13,
              color: "var(--color-text-muted)",
              border: "1px dashed var(--color-border)", borderRadius: 12,
            }}>
              조건에 맞는 아이템이 없습니다
            </div>
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
    </div>
  );
}
