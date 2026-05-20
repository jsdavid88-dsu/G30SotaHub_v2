// 공용 학생/모터헤드 배정 모달.
// ItemDetail, Triage, CategoryDetail 등 어디서든 재사용.
// state 가 null 이면 안 보임 — 외부에서 setState 로 컨트롤.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { triageItem } from "../api/items";
import { cardStyle, btnPrimary, inputStyle, labelStyle } from "../design";

export type AssignModalState = { itemId: number; mode: "assign" | "motorhead" } | null;

type UserSummary = { id: string; name: string; email: string; role: string };

// Hub /api/v1/users/ 호출 (VFX client 가 아닌 root client 사용)
async function fetchHubUsers(role?: string): Promise<UserSummary[]> {
  const token = localStorage.getItem("token");
  const params = new URLSearchParams();
  if (role) params.set("role", role);
  const res = await fetch(`/api/v1/users/?${params.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Hub users API ${res.status}`);
  const data = await res.json();
  const list = (data?.data ?? data) as UserSummary[];
  return Array.isArray(list) ? list : [];
}

export default function AssignModal({
  state, onClose, onDone,
}: {
  state: AssignModalState;
  onClose: () => void;
  onDone: () => void;
}) {
  const isMotorhead = state?.mode === "motorhead";
  const targetRole = isMotorhead ? "external" : "student";

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["hub-users", targetRole],
    queryFn: () => fetchHubUsers(targetRole),
    enabled: !!state,
  });

  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (state) {
      setAssigneeId("");
      setDueDate("");
      setErr(null);
    }
  }, [state]);

  if (!state) return null;

  const submit = async () => {
    if (!assigneeId) { setErr("담당자 선택 필요"); return; }
    setBusy(true); setErr(null);
    try {
      await triageItem(state.itemId, {
        action: state.mode,
        assignee_id: assigneeId,
        due_date: dueDate || undefined,
      });
      onDone();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        ...cardStyle, padding: 28, width: "100%", maxWidth: 480,
        boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
      }}>
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 6 }}>
          {isMotorhead ? "모터헤드 진행" : "학생 배정"}
        </h3>
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 20, lineHeight: 1.5 }}>
          {isMotorhead
            ? "외부(external) 협력자에게 배정 — lifecycle 도 dev 로 자동 전환됩니다."
            : "학생에게 검토 배정 — 리뷰 받고 완료 처리 후 후속개발 단계로."}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>{isMotorhead ? "외부 멤버" : "학생"}</label>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
              disabled={isLoading}
            >
              <option value="">{isLoading ? "로딩 중..." : "선택"}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </select>
            {!isLoading && users.length === 0 && (
              <p style={{ fontSize: 12, color: "var(--color-warning)", marginTop: 6 }}>
                {isMotorhead
                  ? "external 역할 사용자가 없습니다. Admin 페이지에서 모터헤드 멤버를 추가하세요."
                  : "student 역할 사용자가 없습니다."}
              </p>
            )}
          </div>
          <div>
            <label style={labelStyle}>마감일 (옵션)</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} />
          </div>
          {err && (
            <div style={{
              padding: "10px 14px", borderRadius: 10,
              background: "var(--color-danger-light)", color: "var(--color-danger)",
              fontSize: 13,
            }}>{err}</div>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>
          <button onClick={onClose} style={{
            padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 500,
            background: "transparent", color: "var(--color-text-secondary)",
            border: "none", cursor: "pointer",
          }}>취소</button>
          <button onClick={submit} disabled={busy || !assigneeId} style={{
            ...btnPrimary, opacity: busy || !assigneeId ? 0.5 : 1,
            background: isMotorhead ? "#d97706" : "var(--color-accent)",
          }}>
            {busy ? "진행 중..." : (isMotorhead ? "모터헤드 진행" : "배정")}
          </button>
        </div>
      </div>
    </div>
  );
}
