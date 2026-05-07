import { useState } from "react";
import { Link } from "react-router-dom";
import type { Category } from "../types";
import { badgeStyle } from "../design";

function Card({ cat }: { cat: Category }) {
  const [hover, setHover] = useState(false);
  return (
    <Link
      to={`/vfx/category/${cat.slug}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "block", padding: 16, borderRadius: 12,
        background: "var(--color-card)",
        border: `1px solid ${hover ? "var(--color-accent)" : "var(--color-border)"}`,
        textDecoration: "none",
        boxShadow: hover ? "0 4px 12px rgba(79,70,229,0.10)" : "none",
        transform: hover ? "translateY(-2px)" : "none",
        transition: "all 0.18s",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 28 }}>{cat.icon}</div>
        {cat.new_this_week > 0 && (
          <span style={badgeStyle("var(--color-danger-light)", "var(--color-danger)")}>
            +{cat.new_this_week}
          </span>
        )}
      </div>
      <h3 style={{
        fontSize: 14, fontWeight: 600,
        color: hover ? "var(--color-accent)" : "var(--color-text-primary)",
        transition: "color 0.15s",
      }}>
        {cat.name_ko}
      </h3>
      <p style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>{cat.name_en}</p>
      <div style={{
        marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between",
        fontSize: 11,
      }}>
        <span style={{ color: "var(--color-text-muted)" }}>총 {cat.item_count}</span>
        {cat.current_sota.length > 0 && (
          <span title={cat.current_sota[0]} style={{
            color: "var(--color-accent)", maxWidth: 120,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            fontWeight: 500,
          }}>
            ⭐ {cat.current_sota[0].split(" ")[0]}
          </span>
        )}
      </div>
    </Link>
  );
}

export default function CategoryGrid({ categories }: { categories: Category[] }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
      gap: 12,
    }}>
      {categories.map((cat) => <Card key={cat.slug} cat={cat} />)}
    </div>
  );
}
