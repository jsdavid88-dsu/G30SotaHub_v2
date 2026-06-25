import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchItems } from "../api/items";
import ItemCard from "../components/ItemCard";
import { dedup } from "../utils/dedup";
import { pageHeadingStyle, pageSubtitleStyle, cardStyle } from "../design";
import VfxSubNav from "../components/VfxSubNav";

export default function Timeline() {
  const { data: rawItems = [] } = useQuery({
    queryKey: ["items", "timeline"],
    queryFn: () => fetchItems({ hide_low: true, limit: 200 }),  // 관련도 낮음(1~6점) 숨김
  });
  const { deduped: items, groupSources } = useMemo(() => dedup(rawItems), [rawItems]);

  const grouped = items.reduce<Record<string, typeof items>>((acc, item) => {
    const date = new Date(item.discovered_at).toLocaleDateString("ko-KR");
    if (!acc[date]) acc[date] = [];
    acc[date].push(item);
    return acc;
  }, {});

  return (
    <div style={{ width: "100%" }}>
      <VfxSubNav />
      <div style={{ marginBottom: 32 }}>
        <h1 style={pageHeadingStyle}>타임라인</h1>
        <p style={pageSubtitleStyle}>발견된 SOTA 이력을 시간순으로 봅니다.</p>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div style={{ ...cardStyle, padding: 48, textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "var(--color-text-muted)" }}>아직 수집된 데이터가 없습니다.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {Object.entries(grouped).map(([date, dateItems]) => (
            <section key={date}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: 99, background: "var(--color-accent)" }} />
                <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>{date}</h2>
                <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{dateItems.length}건</span>
              </div>
              <div style={{
                marginLeft: 20,
                display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12,
              }}>
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
