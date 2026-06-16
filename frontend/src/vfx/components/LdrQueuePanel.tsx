// LDR 연구 큐 관리 — 야간배치가 LDR 에 던질 질의.
// 수동 큐(추가/토글/삭제) + 오늘 합성될 질의 미리보기(수동+dangling+분야+config).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Plus, Trash2, Eye } from "lucide-react";
import {
  fetchLdrQueue, fetchLdrPreview, addLdrQuery, patchLdrQuery, deleteLdrQuery,
} from "../api/ldr";
import { cardStyle } from "../design";

export default function LdrQueuePanel() {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const { data: items = [] } = useQuery({ queryKey: ["ldr-queue"], queryFn: fetchLdrQueue });
  const { data: preview } = useQuery({ queryKey: ["ldr-preview"], queryFn: fetchLdrPreview, enabled: showPreview });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["ldr-queue"] });
    qc.invalidateQueries({ queryKey: ["ldr-preview"] });
  };
  const add = useMutation({ mutationFn: () => addLdrQuery(text.trim()), onSuccess: () => { setText(""); invalidate(); } });
  const toggle = useMutation({ mutationFn: (it: { id: number; active: boolean }) => patchLdrQuery(it.id, { active: !it.active }), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: number) => deleteLdrQuery(id), onSuccess: invalidate });

  return (
    <section style={{ ...cardStyle, padding: 20, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Search style={{ width: 16, height: 16, color: "var(--color-accent)" }} />
        <span style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>LDR 연구 큐</span>
        <button onClick={() => setShowPreview((v) => !v)}
          style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600,
            padding: "5px 10px", borderRadius: 8, border: "1px solid var(--color-border)", background: "#fff", color: "#64748b", cursor: "pointer" }}>
          <Eye style={{ width: 13, height: 13 }} /> 오늘 질의 미리보기
        </button>
      </div>
      <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 14 }}>
        야간배치(step 0.7)가 LDR 로 던질 질의. <b>수동 큐(아래) + 분야 자동 + Lint dangling + config</b> 가 합쳐져 매일 자동 발견 → Arca 정리.
      </p>

      {/* 미리보기 — 실제 합성 결과 */}
      {showPreview && preview && (
        <div style={{ padding: "10px 14px", borderRadius: 10, background: "#faf5ff", border: "1px solid #e9d5ff", marginBottom: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", marginBottom: 6 }}>
            오늘 LDR 질의 {preview.total}개 (수동 {preview.manual_used} + 자동 {preview.total - preview.manual_used})
          </p>
          {preview.queries.map((q, i) => (
            <div key={i} style={{ fontSize: 12, color: "#581c87", padding: "2px 0" }}>· {q}</div>
          ))}
        </div>
      )}

      {/* 추가 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) add.mutate(); }}
          placeholder="리서치 토픽 추가 (예: real-time video matting 2026)"
          style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 13, outline: "none" }} />
        <button onClick={() => text.trim() && add.mutate()} disabled={!text.trim() || add.isPending}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "8px 14px", borderRadius: 8, border: "none",
            background: "var(--color-accent, #4f46e5)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: text.trim() ? 1 : 0.5 }}>
          <Plus style={{ width: 14, height: 14 }} /> 추가
        </button>
      </div>

      {/* 목록 */}
      {items.length === 0 ? (
        <p style={{ fontSize: 12, color: "#cbd5e1" }}>수동 큐가 비어 있음 — 분야 자동 + dangling 으로만 돌아갑니다.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((it) => (
            <div key={it.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8,
              background: it.active ? "#f8fafc" : "#fff", border: "1px solid var(--color-border)", opacity: it.active ? 1 : 0.55,
            }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", flex: 1, minWidth: 0 }}>
                <input type="checkbox" checked={it.active} onChange={() => toggle.mutate(it)} />
                <span style={{ fontSize: 13, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {it.query}
                </span>
              </label>
              <span style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>
                {it.run_count}회{it.last_run_at ? ` · ${new Date(it.last_run_at).toLocaleDateString("ko-KR")}` : " · 미실행"}
              </span>
              <button onClick={() => remove.mutate(it.id)} title="삭제"
                style={{ border: "none", background: "transparent", color: "#dc2626", cursor: "pointer", padding: 2 }}>
                <Trash2 style={{ width: 14, height: 14 }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
