import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchCategories } from "../api/categories";
import {
  fetchCategoryLineage,
  createLineageEdge,
  confirmLineageEdge,
  deleteLineageEdge,
} from "../api/lineage";
import LineageFlow from "../components/LineageFlow";
import { pageHeadingStyle, pageSubtitleStyle, cardStyle, inputStyle } from "../design";
import VfxSubNav from "../components/VfxSubNav";
import { useAuth } from "../../contexts/AuthContext";

export default function LineageGraph() {
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "professor";
  const qc = useQueryClient();

  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const { data: graph } = useQuery({
    queryKey: ["lineage", "category", selectedSlug],
    queryFn: () => fetchCategoryLineage(selectedSlug),
    enabled: !!selectedSlug,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["lineage", "category", selectedSlug] });
  const createMut = useMutation({
    mutationFn: (v: { parent_id: number; child_id: number }) => createLineageEdge(v),
    onSuccess: invalidate,
    onError: (e: unknown) => alert(`엣지 추가 실패: ${e instanceof Error ? e.message : e}`),
  });
  const confirmMut = useMutation({
    mutationFn: (id: number) => confirmLineageEdge(id),
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteLineageEdge(id),
    onSuccess: invalidate,
  });

  return (
    <div style={{ width: "100%" }}>
      <VfxSubNav />
      <div style={{ marginBottom: 24 }}>
        <h1 style={pageHeadingStyle}>기술 계보</h1>
        <p style={pageSubtitleStyle}>
          Semantic Scholar 인용 + Arca 계열/wiki 자동 연결.
          {canEdit
            ? " 노드를 드래그해 직접 연결하거나, AI 추정 엣지를 확정/삭제할 수 있습니다."
            : " 논문 노드를 클릭해 상세로 이동."}
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
          <LineageFlow
            graph={graph}
            height={700}
            editable={canEdit}
            onCreateEdge={(parentId, childId) => createMut.mutate({ parent_id: parentId, child_id: childId })}
            onConfirmEdge={(id) => confirmMut.mutate(id)}
            onDeleteEdge={(id) => deleteMut.mutate(id)}
          />
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
