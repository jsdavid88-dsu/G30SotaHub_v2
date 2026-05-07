import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { fetchItems } from "../api/items";
import type { Category } from "../types";
import ItemCard from "./ItemCard";
import { dedup } from "../utils/dedup";
import { cardStyle, sectionHeaderStyle, badgeStyle } from "../design";

export default function CategorySection({ category }: { category: Category }) {
  const { data: rawItems = [] } = useQuery({
    queryKey: ["items", "category-section", category.slug],
    queryFn: () => fetchItems({ category: category.slug, sort: "discovered", limit: 12 }),
  });
  const { deduped, groupSources } = useMemo(() => dedup(rawItems), [rawItems]);
  const items = deduped.slice(0, 6);

  if (items.length === 0 && category.item_count === 0) return null;

  return (
    <section style={{ ...cardStyle, overflow: "hidden" }}>
      <div style={{ ...sectionHeaderStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <Link to={`/vfx/category/${category.slug}`} style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none" }}>
          <span style={{ fontSize: 28 }}>{category.icon}</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>
              {category.name_ko}
              <span style={{ color: "var(--color-text-muted)", fontWeight: 400, marginLeft: 8 }}>
                ({category.item_count})
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>{category.name_en}</div>
          </div>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {category.new_this_week > 0 && (
            <span style={badgeStyle("var(--color-danger-light)", "var(--color-danger)")}>
              +{category.new_this_week} 이번 주
            </span>
          )}
          <Link
            to={`/vfx/category/${category.slug}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 13, color: "var(--color-accent)", textDecoration: "none", fontWeight: 500 }}
          >
            전체 보기 <ChevronRight style={{ width: 14, height: 14 }} />
          </Link>
        </div>
      </div>

      {category.current_sota.length > 0 && (
        <div style={{ padding: "12px 28px 0", fontSize: 12, color: "var(--color-text-muted)" }}>
          현재 SOTA: <span style={{ color: "var(--color-accent)", fontWeight: 500 }}>⭐ {category.current_sota.join(", ")}</span>
        </div>
      )}

      <div style={{ padding: 20 }}>
        {items.length === 0 ? (
          <div style={{
            border: "1px dashed var(--color-border)", borderRadius: 12, padding: 24,
            textAlign: "center", fontSize: 13, color: "var(--color-text-muted)",
          }}>
            수집된 아이템이 없습니다
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
    </section>
  );
}
