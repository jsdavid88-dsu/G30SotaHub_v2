import { useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import type { LineageGraph } from "../api/lineage";

type Props = {
  graph: LineageGraph | undefined;
  height?: number | string;
};

const PRIORITY_COLORS: Record<string, string> = {
  P0: "#dc2626",
  P1: "#d97706",
  P2: "#059669",
  P3: "#525252",
  WATCH: "#404040",
};

function layoutByYear(nodes: LineageGraph["nodes"]): Map<number, { x: number; y: number }> {
  // Simple year-based horizontal layout.
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

export default function LineageFlow({ graph, height = 600 }: Props) {
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
        // 이슈 #15 P3-7: Hub light 테마. center 는 accent 보라, 나머지는 흰 카드 + 어두운 글자.
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

    const e: Edge[] = graph.edges.map((edge, idx) => ({
      id: `e${edge.parent_id}-${edge.child_id}-${idx}`,
      source: String(edge.parent_id),
      target: String(edge.child_id),
      animated: false,
      style: { stroke: "#6366f1", strokeWidth: 1 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "#6366f1",
      },
      label: edge.relationship_type === "cites" ? "" : undefined,
    }));

    return { nodes: n, edges: e };
  }, [graph]);

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

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        height,
        border: "1px solid var(--color-border)",
        background: "var(--color-card)",
      }}
    >
      <ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.2} maxZoom={2}>
        <Background color="#e2e8f0" gap={16} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
