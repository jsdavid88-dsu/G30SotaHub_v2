// Triage 액션 버튼 그룹 — 모델 한 행에 표시.
// 컨텍스트(workflow status + lifecycle) 에 따라 다른 버튼 노출.
import { useState } from "react";
import {
  UserPlus, PauseCircle, SkipForward, CheckCircle2,
  Wrench, Archive, RotateCcw, Briefcase, Loader2,
} from "lucide-react";
import type { Item } from "../types";
import { triageItem, type TriagePayload } from "../api/items";

export type TriageActionsProps = {
  item: Item;
  onDone: () => void;
  size?: "sm" | "md";
  // 외부에서 배정 모달을 띄울 때 콜백 제공 (페이지 단일 모달 공유용)
  onRequestAssign?: (itemId: number, mode: "assign" | "motorhead") => void;
};

const btnBase = (color: string, bg: string): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 4,
  padding: "5px 10px", borderRadius: 6,
  fontSize: 11, fontWeight: 600, color, background: bg,
  border: "1px solid transparent", cursor: "pointer",
  transition: "all 0.12s",
  whiteSpace: "nowrap",
});

export default function TriageActions({ item, onDone, size = "sm", onRequestAssign }: TriageActionsProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const ws = item.status || "new";
  const ls = item.lifecycle_status || "research";

  const fontSize = size === "sm" ? 11 : 12;
  const padding = size === "sm" ? "5px 10px" : "6px 12px";
  const iconSize = size === "sm" ? 12 : 13;

  const run = async (label: string, payload: TriagePayload) => {
    setBusy(label);
    try {
      await triageItem(item.id, payload);
      onDone();
    } catch (e) {
      alert(`${label} 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const Btn = ({
    icon: Icon, label, color, bg, onClick, hoverBg,
  }: {
    icon: typeof UserPlus; label: string; color: string; bg: string; hoverBg?: string;
    onClick: () => void;
  }) => {
    const isBusy = busy === label;
    return (
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!busy) onClick(); }}
        disabled={busy !== null}
        title={label}
        style={{
          ...btnBase(color, bg),
          padding, fontSize,
          opacity: busy && !isBusy ? 0.4 : 1,
          cursor: busy ? "not-allowed" : "pointer",
        }}
        onMouseEnter={(e) => { if (!busy && hoverBg) (e.currentTarget as HTMLButtonElement).style.background = hoverBg; }}
        onMouseLeave={(e) => { if (!busy && hoverBg) (e.currentTarget as HTMLButtonElement).style.background = bg; }}
      >
        {isBusy ? (
          <Loader2 style={{ width: iconSize, height: iconSize, animation: "spin 0.8s linear infinite" }} />
        ) : (
          <Icon style={{ width: iconSize, height: iconSize }} />
        )}
        {label}
      </button>
    );
  };

  // 컨텍스트별 버튼 셋
  const buttons: React.ReactNode[] = [];

  // 배정 — new/holding 에서 노출
  if (ws === "new" || ws === "holding") {
    buttons.push(
      <Btn key="assign" icon={UserPlus} label="배정" color="#fff" bg="#4f46e5" hoverBg="#3730a3"
        onClick={() => onRequestAssign ? onRequestAssign(item.id, "assign") : alert("배정은 페이지 모달 필요")} />
    );
    buttons.push(
      <Btn key="motorhead" icon={Briefcase} label="모터헤드" color="#fff" bg="#d97706" hoverBg="#b45309"
        onClick={() => onRequestAssign ? onRequestAssign(item.id, "motorhead") : alert("모터헤드 모달 필요")} />
    );
  }

  // 보류 — new 에서만
  if (ws === "new") {
    buttons.push(
      <Btn key="hold" icon={PauseCircle} label="보류" color="#b45309" bg="#fef3c7" hoverBg="#fde68a"
        onClick={() => run("보류", { action: "hold" })} />
    );
  }

  // 스킵 — new/holding 에서
  if (ws === "new" || ws === "holding") {
    buttons.push(
      <Btn key="skip" icon={SkipForward} label="스킵" color="#64748b" bg="#f1f5f9" hoverBg="#e2e8f0"
        onClick={() => run("스킵", { action: "skip" })} />
    );
  }

  // 완료 — triaged + (research|dev|testing) 에서. 또는 active assignment 가 있는 경우
  const hasActiveAssignment = (item.assignments ?? []).some(
    (a) => a.status !== "approved" && a.status !== "rejected"
  );
  if (ws === "triaged" && (ls === "research" || ls === "dev" || ls === "testing") && hasActiveAssignment) {
    buttons.push(
      <Btn key="complete" icon={CheckCircle2} label="완료" color="#fff" bg="#059669" hoverBg="#047857"
        onClick={() => run("완료", { action: "complete" })} />
    );
  }

  // 후속개발 — triaged 에서 lifecycle 이 dev 가 아니면 노출
  if (ws === "triaged" && ls !== "dev" && ls !== "production" && ls !== "deprecated") {
    buttons.push(
      <Btn key="follow" icon={Wrench} label="후속개발" color="#1d4ed8" bg="#dbeafe" hoverBg="#bfdbfe"
        onClick={() => run("후속개발", { action: "follow_up" })} />
    );
  }

  // 아카이빙 — archived/skipped 외에는 다 노출 (production 도 가능)
  if (ws !== "archived" && ws !== "skipped") {
    buttons.push(
      <Btn key="archive" icon={Archive} label="아카이브" color="#6b7280" bg="#f9fafb" hoverBg="#f3f4f6"
        onClick={() => run("아카이브", { action: "archive" })} />
    );
  }

  // 복귀 — skipped/archived 인 경우 다시 new 로
  if (ws === "skipped" || ws === "archived") {
    buttons.push(
      <Btn key="restore" icon={RotateCcw} label="복귀" color="#4f46e5" bg="#e0e7ff" hoverBg="#c7d2fe"
        onClick={async () => {
          // 직접 PATCH 사용
          setBusy("복귀");
          try {
            const { patchItem } = await import("../api/items");
            await patchItem(item.id, { status: "new" });
            onDone();
          } catch (e) {
            alert(`복귀 실패: ${e instanceof Error ? e.message : String(e)}`);
          } finally {
            setBusy(null);
          }
        }} />
    );
  }

  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
      {buttons}
    </div>
  );
}
