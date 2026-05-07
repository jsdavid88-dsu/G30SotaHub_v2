import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send } from "lucide-react";
import { createComment, fetchComments } from "../api/comments";
import { cardStyle, sectionHeaderStyle, btnPrimary } from "../design";

export default function CommentSection({ itemId }: { itemId: number }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");

  const { data: comments = [] } = useQuery({
    queryKey: ["comments", itemId], queryFn: () => fetchComments(itemId),
  });

  const mutation = useMutation({
    mutationFn: (content: string) => createComment(itemId, content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comments", itemId] });
      setText("");
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    mutation.mutate(trimmed);
  };

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
            <button type="submit" disabled={!text.trim() || mutation.isPending}
              style={{ ...btnPrimary, opacity: !text.trim() || mutation.isPending ? 0.4 : 1 }}>
              <Send style={{ width: 12, height: 12 }} />
              {mutation.isPending ? "전송 중..." : "전송"}
            </button>
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
            {comments.map((c) => (
              <div key={c.id} style={{
                padding: "12px 16px", borderRadius: 12,
                background: "#f8fafc", border: "1px solid var(--color-border)",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
                    {c.user_name || "익명"}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                    {new Date(c.created_at).toLocaleString("ko-KR")}
                  </span>
                </div>
                <p style={{ fontSize: 14, color: "var(--color-text-secondary)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                  {c.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
