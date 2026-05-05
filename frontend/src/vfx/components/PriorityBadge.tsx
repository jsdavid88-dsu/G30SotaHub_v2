import type { Item } from "../types";

const styles: Record<NonNullable<Item["priority"]>, string> = {
  P0: "bg-red-600 text-white",
  P1: "bg-amber-500 text-white",
  P2: "bg-emerald-600 text-white",
  P3: "bg-neutral-600 text-white",
  WATCH: "bg-neutral-800 text-neutral-400 border border-neutral-700",
};

export default function PriorityBadge({ priority }: { priority: Item["priority"] }) {
  if (!priority) return null;
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ${styles[priority]}`}>
      {priority}
    </span>
  );
}
