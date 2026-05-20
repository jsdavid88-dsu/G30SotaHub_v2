import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { fetchItems } from "../api/items";
import type { Category } from "../types";
import ItemCard from "./ItemCard";
import ItemTable from "./ItemTable";
import ViewToggle from "./ViewToggle";
import { useViewMode } from "../utils/viewMode";
import { dedup } from "../utils/dedup";
import { cardStyle, sectionHeaderStyle, badgeStyle } from "../design";

type AssignReq = { itemId: number; mode: "assign" | "motorhead" };

export default function CategorySection({
  category,
  onRequestAssign,
}: {
  category: Category;
  onRequestAssign?: (req: AssignReq) => void;
}) {
  const qc = useQueryClient();
  const [viewMode] = useViewMode();
  // table 모드면 좀 더 많이 가져와서 한 번에 보여줌
  const limit = viewMode === "table" ? 30 : 12;

  const { data: rawItems = [] } = useQuery({
    queryKey: ["items", "category-section", category.slug, viewMode],
    queryFn: () => fetchItems({ category: category.slug, sort: "published", limit }),
  });
  const { deduped, groupSources } = useMemo(() => dedup(rawItems), [rawItems]);
  const items = viewMode === "table" ? deduped : deduped.slice(0, 6);

  if (items.length === 0 && category.item_count === 0) return null;

  const refreshItems = () => qc.invalidateQueries({ queryKey: ["items"] });

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
        ) : viewMode === "table" ? (
          <ItemTable
            items={items}
            sortKey="published_at"
            sortDir="desc"
            showActions
            onActionDone={refreshItems}
            onRequestAssign={(itemId, mode) => onRequestAssign?.({ itemId, mode })}
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
    </section>
  );
}

// 다른 곳에서 호환 위해 ViewToggle 도 re-export (이전 import 깨짐 회피)
export { ViewToggle };
