import { useMemo, useState, useCallback, type MouseEvent } from "react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  type Connection,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import type { LineageGraph } from "../api/lineage";

type Props = {
  graph: LineageGraph | undefined;
  height?: number | string;
  // Phase 3: 편집 모드 (professor/admin). 노드↔노드 드래그로 자유 엣지, 엣지 클릭으로 확정/삭제.
  editable?: boolean;
  onCreateEdge?: (parentId: number, childId: number) => void;
  onConfirmEdge?: (edgeId: number) => void;
  onDeleteEdge?: (edgeId: number) => void;
};

const PRIORITY_COLORS: Record<string, string> = {
  P0: "#dc2626",
  P1: "#d97706",
  P2: "#059669",
  P3: "#525252",
  WATCH: "#404040",
};

function layoutByYear(nodes: LineageGraph["nodes"]): Map<number, { x: number; y: number }> {
  const sorted = [...nodes].sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
  const positions = new Map<number, { x: number; y: number }>();
  const yearRows = new Map<number, number>();
  sorted.forEach((node, idx) => {
    const year = node.year ?? 0;
    const row = yearRows.get(year) ?? 0;
    yearRows.set(year, row + 1);
    positions.set(node.id, {
      x: (year ? (year - 2020) * 240 : idx * 220) + 40,
      y: row * 120 + 40,
    });
  });
  return positions;
}

type SelEdge = { id: number; origin: string; status: string; rel: string } | null;

export default function LineageFlow({
  graph,
  height = 600,
  editable = false,
  onCreateEdge,
  onConfirmEdge,
  onDeleteEdge,
}: Props) {
  const [sel, setSel] = useState<SelEdge>(null);

  const { nodes, edges } = useMemo(() => {
    if (!graph || graph.nodes.length === 0) {
      return { nodes: [] as Node[], edges: [] as Edge[] };
    }
    const positions = layoutByYear(graph.nodes);

    const n: Node[] = graph.nodes.map((node) => ({
      id: String(node.id),
      position: positions.get(node.id) ?? { x: 0, y: 0 },
      data: {
        label: (
          <div className="text-[10px] leading-tight">
            <div className="font-semibold truncate max-w-[180px]">{node.title}</div>
            <div className="text-[9px] opacity-70 mt-1">
              {node.year ?? "?"} · {node.source}
              {node.priority ? ` · ${node.priority}` : ""}
            </div>
          </div>
        ),
      },
      style: {
        background: node.id === graph.center_id ? "#7c3aed" : "#ffffff",
        color: node.id === graph.center_id ? "#ffffff" : "#1e293b",
        border: `1.5px solid ${
          node.priority ? PRIORITY_COLORS[node.priority] ?? "#cbd5e1" : "#cbd5e1"
        }`,
        borderRadius: 8,
        padding: 8,
        width: 200,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
      },
    }));

    const e: Edge[] = graph.edges.map((edge, idx) => {
      // 관계/출처별 시각 구분:
      //  - 자동 인용(cites): 파란 실선 / same_family: 초록 점선 "계열" / wiki_ref: 보라 점선 "참조"
      //  - 수동(manual): 청록 실선, 관계명 라벨 (사람이 직접 그린 자유 엣지)
      //  - 추정(status=suggested, Arca): 주황 점선 애니메이션 "추정?" (confirm 대기)
      const rel = edge.relationship_type;
      const origin = edge.origin ?? "auto";
      const status = edge.status ?? "confirmed";
      const isSuggested = status === "suggested";
      const isManual = origin === "manual";
      const isFamily = rel === "same_family";
      const isWiki = rel === "wiki_ref";
      let color = "#6366f1";
      if (isSuggested) color = "#f59e0b";
      else if (isManual) color = "#0d9488";
      else if (isFamily) color = "#10b981";
      else if (isWiki) color = "#a855f7";
      const dashed = isSuggested || isFamily || isWiki;
      let label: string | undefined;
      if (isSuggested) label = "추정?";
      else if (isManual) label = rel;
      else if (isFamily) label = "계열";
      else if (isWiki) label = "참조";
      return {
        id: `e${edge.parent_id}-${edge.child_id}-${idx}`,
        source: String(edge.parent_id),
        target: String(edge.child_id),
        animated: isSuggested,
        data: { edgeId: edge.id, origin, status, rel },
        style: {
          stroke: color,
          strokeWidth: dashed ? 1.5 : 1,
          strokeDasharray: dashed ? "5 4" : undefined,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color },
        label,
        labelStyle: label ? { fill: color, fontSize: 10, fontWeight: 600 } : undefined,
        labelBgStyle: isSuggested
          ? { fill: "#fef3c7" }
          : isManual
          ? { fill: "#ccfbf1" }
          : isFamily
          ? { fill: "#d1fae5" }
          : isWiki
          ? { fill: "#f3e8ff" }
          : undefined,
      };
    });

    return { nodes: n, edges: e };
  }, [graph]);

  const handleConnect = useCallback(
    (c: Connection) => {
      if (!editable || !onCreateEdge || !c.source || !c.target) return;
      if (c.source === c.target) return;
      onCreateEdge(Number(c.source), Number(c.target));
    },
    [editable, onCreateEdge]
  );

  const handleEdgeClick = useCallback(
    (_evt: MouseEvent, edge: Edge) => {
      if (!editable) return;
      const d = edge.data as { edgeId?: number; origin?: string; status?: string; rel?: string } | undefined;
      if (!d?.edgeId) return;
      setSel({ id: d.edgeId, origin: d.origin ?? "auto", status: d.status ?? "confirmed", rel: d.rel ?? "" });
    },
    [editable]
  );

  if (!graph || graph.nodes.length === 0) {
    return (
      <div
        className="rounded-xl border border-dashed flex items-center justify-center text-sm"
        style={{
          height,
          borderColor: "var(--color-border)",
          background: "var(--color-card)",
          color: "var(--color-text-muted)",
        }}
      >
        계보 데이터가 없습니다 (Semantic Scholar 수집 대기)
      </div>
    );
  }

  const pill: React.CSSProperties = {
    position: "absolute",
    zIndex: 5,
    padding: "5px 10px",
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 500,
    background: "rgba(255,255,255,0.92)",
    border: "1px solid var(--color-border)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  };
  const actBtn: React.CSSProperties = {
    padding: "4px 10px",
    borderRadius: 7,
    fontSize: 12,
    fontWeight: 600,
    border: "1px solid var(--color-border)",
    background: "#fff",
    cursor: "pointer",
  };

  return (
    <div
      style={{
        position: "relative",
        height,
        border: "1px solid var(--color-border)",
        background: "var(--color-card)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        minZoom={0.2}
        maxZoom={2}
        nodesConnectable={editable}
        elementsSelectable
        onConnect={handleConnect}
        onEdgeClick={handleEdgeClick}
      >
        <Background color="#e2e8f0" gap={16} />
        <Controls />
      </ReactFlow>

      {editable && (
        <div style={{ ...pill, top: 10, left: 10, color: "var(--color-text-muted)" }}>
          노드 아래 점에서 다른 노드로 드래그 → 계보 직접 연결 · 엣지 클릭 → 확정/삭제
        </div>
      )}

      {editable && sel && (
        <div
          style={{
            ...pill,
            top: 10,
            right: 10,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ color: "var(--color-text-secondary)" }}>
            {sel.status === "suggested" ? "🟠 AI 추정" : sel.origin === "manual" ? "🟢 수동" : "🔵 자동"}
            {sel.rel ? ` · ${sel.rel}` : ""}
          </span>
          {sel.status === "suggested" && onConfirmEdge && (
            <button
              style={{ ...actBtn, color: "#0d9488", borderColor: "#5eead4" }}
              onClick={() => {
                onConfirmEdge(sel.id);
                setSel(null);
              }}
            >
              확정
            </button>
          )}
          {onDeleteEdge && (
            <button
              style={{ ...actBtn, color: "#dc2626", borderColor: "#fca5a5" }}
              onClick={() => {
                onDeleteEdge(sel.id);
                setSel(null);
              }}
            >
              {sel.status === "suggested" ? "거부" : "삭제"}
            </button>
          )}
          <button style={{ ...actBtn, color: "var(--color-text-muted)" }} onClick={() => setSel(null)}>
            닫기
          </button>
        </div>
      )}
    </div>
  );
}
