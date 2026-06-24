// Triage 액션 버튼 그룹 — 모델 한 행에 표시.
// 1트랙 모델: 새로 발견 → (배정) 연구중 → 완료   · 옆길: 보류 / 제외
// 헷갈리던 라이프사이클(연구/개발/테스트/운영/폐기)·후속개발·아카이브는 UI 에서 제거.
import { useState } from "react";
import {
  UserPlus, PauseCircle, SkipForward, CheckCircle2,
  RotateCcw, Briefcase, Loader2,
} from "lucide-react";
import type { Item } from "../types";
import { triageItem, patchItem, type TriagePayload } from "../api/items";

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

  const setStatus = async (label: string, status: "new" | "triaged") => {
    setBusy(label);
    try {
      await patchItem(item.id, { status });
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

  const buttons: React.ReactNode[] = [];

  // 새로 발견 / 보류 → 배정(=연구중 시작) · 모터헤드(외부 배정)
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

  // 보류 — 새로 발견에서만
  if (ws === "new") {
    buttons.push(
      <Btn key="hold" icon={PauseCircle} label="보류" color="#b45309" bg="#fef3c7" hoverBg="#fde68a"
        onClick={() => run("보류", { action: "hold" })} />
    );
  }

  // 완료 — 연구중이면 항상 (조합 조건 제거 — 더 안 해도 되면 누른다)
  if (ws === "triaged") {
    buttons.push(
      <Btn key="complete" icon={CheckCircle2} label="완료" color="#fff" bg="#059669" hoverBg="#047857"
        onClick={() => run("완료", { action: "complete" })} />
    );
  }

  // 완료 → 다시 연구중으로 (reopen)
  if (ws === "done") {
    buttons.push(
      <Btn key="reopen" icon={RotateCcw} label="연구중으로" color="#4f46e5" bg="#e0e7ff" hoverBg="#c7d2fe"
        onClick={() => setStatus("연구중으로", "triaged")} />
    );
  }

  // 제외 — 새로발견/보류/연구중/완료 어디서든 (치우기)
  if (ws === "new" || ws === "holding" || ws === "triaged" || ws === "done") {
    buttons.push(
      <Btn key="skip" icon={SkipForward} label="제외" color="#64748b" bg="#f1f5f9" hoverBg="#e2e8f0"
        onClick={() => run("제외", { action: "skip" })} />
    );
  }

  // 복귀 — 제외/아카이브 → 새로 발견
  if (ws === "skipped" || ws === "archived") {
    buttons.push(
      <Btn key="restore" icon={RotateCcw} label="복귀" color="#4f46e5" bg="#e0e7ff" hoverBg="#c7d2fe"
        onClick={() => setStatus("복귀", "new")} />
    );
  }

  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
      {buttons}
    </div>
  );
}
