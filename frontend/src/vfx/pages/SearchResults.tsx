import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { searchItems } from "../api/search";
import ItemCard from "../components/ItemCard";
import { dedup } from "../utils/dedup";
import { pageHeadingStyle, pageSubtitleStyle, cardStyle } from "../design";

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
    <div style={{ width: "100%" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={pageHeadingStyle}>검색 결과</h1>
        <p style={pageSubtitleStyle}>
          "<span style={{ color: "var(--color-accent)", fontWeight: 500 }}>{q}</span>" — {isLoading ? "..." : `${items.length}건`}
        </p>
      </div>

      {q.length < 2 ? (
        <div style={{ ...cardStyle, padding: 48, textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "var(--color-text-muted)" }}>2자 이상 입력하세요</p>
        </div>
      ) : items.length === 0 && !isLoading ? (
        <div style={{ ...cardStyle, padding: 48, textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "var(--color-text-muted)" }}>결과 없음</p>
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
  );
}
