import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCategories } from "../api/categories";
import { fetchCategoryLineage } from "../api/lineage";
import LineageFlow from "../components/LineageFlow";
import { pageHeadingStyle, pageSubtitleStyle, cardStyle, inputStyle } from "../design";

export default function LineageGraph() {
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const { data: graph } = useQuery({
    queryKey: ["lineage", "category", selectedSlug],
    queryFn: () => fetchCategoryLineage(selectedSlug),
    enabled: !!selectedSlug,
  });

  return (
    <div style={{ width: "100%" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={pageHeadingStyle}>기술 계보</h1>
        <p style={pageSubtitleStyle}>
          Semantic Scholar 인용 관계 기반. 논문 노드를 클릭해 상세로 이동.
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)" }}>카테고리</label>
        <select
          value={selectedSlug}
          onChange={(e) => setSelectedSlug(e.target.value)}
          style={{ ...inputStyle, width: "auto", maxWidth: 320 }}
        >
          <option value="">선택하세요</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>{c.icon} {c.name_ko}</option>
          ))}
        </select>
      </div>

      {selectedSlug ? (
        <div style={{ ...cardStyle, padding: 16 }}>
          <LineageFlow graph={graph} height={700} />
        </div>
      ) : (
        <div style={{ ...cardStyle, padding: 48, textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "var(--color-text-muted)" }}>
            카테고리를 선택하면 계보 그래프가 표시됩니다
          </p>
        </div>
      )}
    </div>
  );
}
