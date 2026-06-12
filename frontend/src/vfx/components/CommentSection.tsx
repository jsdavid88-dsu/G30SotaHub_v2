import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send, CheckCircle2 } from "lucide-react";
import { createComment, fetchComments } from "../api/comments";
import { cardStyle, sectionHeaderStyle, btnPrimary } from "../design";
import { useRole } from "../../contexts/RoleContext";

const roleLabel: Record<string, string> = {
  professor: "교수", admin: "관리자", external: "외부연구원", student: "학생",
};

export default function CommentSection({ itemId }: { itemId: number }) {
  const qc = useQueryClient();
  const { currentRole } = useRole();
  // 컨펌(승인)은 교수·외부연구원·admin 만 — 학생은 일반 댓글만.
  const canConfirm = currentRole === "professor" || currentRole === "admin" || currentRole === "external";
  const [text, setText] = useState("");

  const { data: comments = [] } = useQuery({
    queryKey: ["comments", itemId], queryFn: () => fetchComments(itemId),
  });

  const mutation = useMutation({
    mutationFn: ({ content, kind }: { content: string; kind: "comment" | "confirm" }) =>
      createComment(itemId, content, kind),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comments", itemId] });
      setText("");
    },
  });

  const submit = (kind: "comment" | "confirm") => {
    const trimmed = text.trim();
    if (!trimmed) return;
    mutation.mutate({ content: trimmed, kind });
  };
  const onSubmit = (e: FormEvent) => { e.preventDefault(); submit("comment"); };

  return (
    <section style={{ ...cardStyle, overflow: "hidden" }}>
      <div style={{ ...sectionHeaderStyle, display: "flex", alignItems: "center", gap: 8 }}>
        <MessageSquare style={{ width: 16, height: 16, color: "var(--color-accent)" }} />
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>
          댓글 <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>({comments.length})</span>
        </div>
      </div>

      <div style={{ padding: 20 }}>
        <form onSubmit={onSubmit} style={{
          padding: 16, borderRadius: 12,
          background: "#fff", border: "1px solid var(--color-border)",
          marginBottom: comments.length > 0 ? 16 : 0,
        }}>
          <textarea
            value={text} onChange={(e) => setText(e.target.value)}
            placeholder="팀원에게 메모 남기기..." rows={3}
            style={{
              width: "100%", border: "none", outline: "none", resize: "none",
              fontSize: 14, color: "var(--color-text-primary)", background: "transparent",
              fontFamily: "inherit",
            }}
          />
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginTop: 8, paddingTop: 8, borderTop: "1px solid #f1f5f9",
          }}>
            <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{text.length} / 4000</span>
            <div style={{ display: "flex", gap: 8 }}>
              {canConfirm && (
                <button type="button" disabled={!text.trim() || mutation.isPending}
                  onClick={() => submit("confirm")}
                  title="이 모델의 연구 결과를 컨펌(승인)합니다"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "6px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                    border: "1px solid #10b981", background: "#ecfdf5", color: "#047857",
                    cursor: "pointer", opacity: !text.trim() || mutation.isPending ? 0.4 : 1,
                  }}>
                  <CheckCircle2 style={{ width: 13, height: 13 }} />
                  컨펌
                </button>
              )}
              <button type="submit" disabled={!text.trim() || mutation.isPending}
                style={{ ...btnPrimary, opacity: !text.trim() || mutation.isPending ? 0.4 : 1 }}>
                <Send style={{ width: 12, height: 12 }} />
                {mutation.isPending ? "전송 중..." : "전송"}
              </button>
            </div>
          </div>
        </form>

        {comments.length === 0 ? (
          <div style={{
            padding: 24, textAlign: "center", fontSize: 13,
            color: "var(--color-text-muted)",
            border: "1px dashed var(--color-border)", borderRadius: 12,
          }}>
            첫 댓글을 남겨보세요
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {comments.map((c) => {
              const isConfirm = c.kind === "confirm";
              return (
              <div key={c.id} style={{
                padding: "12px 16px", borderRadius: 12,
                background: isConfirm ? "#ecfdf5" : "#f8fafc",
                border: isConfirm ? "1px solid #6ee7b7" : "1px solid var(--color-border)",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
                    {isConfirm && <CheckCircle2 style={{ width: 14, height: 14, color: "#10b981" }} />}
                    {c.user_name || "익명"}
                    {c.user_role && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 99, background: isConfirm ? "#d1fae5" : "#e2e8f0", color: isConfirm ? "#047857" : "#64748b" }}>
                        {roleLabel[c.user_role] || c.user_role}{isConfirm ? " 컨펌" : ""}
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                    {new Date(c.created_at).toLocaleString("ko-KR")}
                  </span>
                </div>
                <p style={{ fontSize: 14, color: "var(--color-text-secondary)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                  {c.content}
                </p>
              </div>
            );})}
          </div>
        )}
      </div>
    </section>
  );
}
