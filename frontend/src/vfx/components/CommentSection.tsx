import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send } from "lucide-react";
import { createComment, fetchComments } from "../api/comments";

type Props = {
  itemId: number;
};

export default function CommentSection({ itemId }: Props) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");

  const { data: comments = [] } = useQuery({
    queryKey: ["comments", itemId],
    queryFn: () => fetchComments(itemId),
  });

  const mutation = useMutation({
    mutationFn: (content: string) => createComment(itemId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", itemId] });
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
    <section className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-neutral-300">
        <MessageSquare className="h-4 w-4" />
        댓글 ({comments.length})
      </div>

      <form onSubmit={onSubmit} className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="팀원에게 메모 남기기..."
          rows={3}
          className="w-full resize-none bg-transparent text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
        />
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-neutral-800">
          <span className="text-[10px] text-neutral-500">
            {text.length} / 4000
          </span>
          <button
            type="submit"
            disabled={!text.trim() || mutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="h-3 w-3" />
            {mutation.isPending ? "전송 중..." : "전송"}
          </button>
        </div>
      </form>

      {comments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-800 p-6 text-center text-xs text-neutral-500">
          첫 댓글을 남겨보세요
        </div>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-neutral-800 bg-neutral-900 p-3"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-neutral-300">
                  {c.user_name || "익명"}
                </span>
                <span className="text-[10px] text-neutral-500">
                  {new Date(c.created_at).toLocaleString("ko-KR")}
                </span>
              </div>
              <p className="text-sm text-neutral-200 whitespace-pre-wrap">{c.content}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
