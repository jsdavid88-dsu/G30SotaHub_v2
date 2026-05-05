import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Link2, Search, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";
import {
  createSubmission,
  fetchSubmissions,
  fetchSubmissionStats,
  type Submission,
} from "../api/submissions";

const STATUS_STYLES: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  pending: { icon: Clock, color: "text-amber-400", label: "대기" },
  processing: { icon: Loader2, color: "text-blue-400", label: "조사중" },
  done: { icon: CheckCircle, color: "text-emerald-400", label: "완료" },
  rejected: { icon: XCircle, color: "text-red-400", label: "거절" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.pending;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${s.color}`}>
      <Icon className={`h-3 w-3 ${status === "processing" ? "animate-spin" : ""}`} />
      {s.label}
    </span>
  );
}

function SubmissionRow({ sub }: { sub: Submission }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
      <div className="flex-shrink-0">
        {sub.input_type === "url" ? (
          <Link2 className="h-4 w-4 text-brand-400" />
        ) : (
          <Search className="h-4 w-4 text-purple-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-neutral-200 truncate">{sub.input_value}</div>
        <div className="text-[10px] text-neutral-500">
          {sub.submitted_by || "익명"} · {new Date(sub.created_at).toLocaleString("ko-KR")}
          {sub.reject_reason && (
            <span className="text-red-400"> · {sub.reject_reason}</span>
          )}
        </div>
      </div>
      <StatusBadge status={sub.status} />
      {sub.result_item_id && (
        <Link
          to={`/item/${sub.result_item_id}`}
          className="text-[10px] text-brand-400 hover:text-brand-300 whitespace-nowrap"
        >
          결과 보기 →
        </Link>
      )}
    </div>
  );
}

export default function Submit() {
  const queryClient = useQueryClient();
  const [inputType, setInputType] = useState<"url" | "keyword">("url");
  const [inputValue, setInputValue] = useState("");
  const [submittedBy, setSubmittedBy] = useState("");

  const { data: stats } = useQuery({
    queryKey: ["submission-stats"],
    queryFn: fetchSubmissionStats,
  });
  const { data: submissions = [] } = useQuery({
    queryKey: ["submissions"],
    queryFn: () => fetchSubmissions(),
  });

  const mutation = useMutation({
    mutationFn: createSubmission,
    onSuccess: () => {
      setInputValue("");
      queryClient.invalidateQueries({ queryKey: ["submissions"] });
      queryClient.invalidateQueries({ queryKey: ["submission-stats"] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    mutation.mutate({
      input_type: inputType,
      input_value: inputValue.trim(),
      submitted_by: submittedBy.trim() || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">제보</h1>
        <p className="text-sm text-neutral-500 mt-1">
          URL이나 키워드를 제출하면 아르카가 야간 배치에서 조사합니다.
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="flex gap-3">
          {Object.entries(STATUS_STYLES).map(([key, s]) => (
            <div
              key={key}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5"
            >
              <s.icon className={`h-3.5 w-3.5 ${s.color}`} />
              <span className="text-xs text-neutral-300">
                {s.label} {(stats as Record<string, number>)[key] ?? 0}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Submit form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 space-y-4"
      >
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setInputType("url")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              inputType === "url"
                ? "bg-brand-500/20 text-brand-300 border border-brand-500/40"
                : "bg-neutral-800 text-neutral-400 border border-neutral-700 hover:border-neutral-600"
            }`}
          >
            <Link2 className="h-3.5 w-3.5" />
            URL
          </button>
          <button
            type="button"
            onClick={() => setInputType("keyword")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              inputType === "keyword"
                ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                : "bg-neutral-800 text-neutral-400 border border-neutral-700 hover:border-neutral-600"
            }`}
          >
            <Search className="h-3.5 w-3.5" />
            키워드
          </button>
        </div>

        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={
            inputType === "url"
              ? "https://arxiv.org/abs/... 또는 GitHub/HF URL"
              : "comfyui video inpainting workflow ..."
          }
          className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 focus:border-brand-500 focus:outline-none"
        />

        <div className="flex items-center gap-3">
          <input
            type="text"
            value={submittedBy}
            onChange={(e) => setSubmittedBy(e.target.value)}
            placeholder="이름 (선택)"
            className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-300 placeholder-neutral-500 focus:border-brand-500 focus:outline-none w-40"
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || mutation.isPending}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="h-3.5 w-3.5" />
            {mutation.isPending ? "제출중..." : "제출"}
          </button>
        </div>

        {mutation.isError && (
          <p className="text-xs text-red-400">
            {(mutation.error as Error).message}
          </p>
        )}
        {mutation.isSuccess && (
          <p className="text-xs text-emerald-400">제출 완료! 야간 배치에서 처리됩니다.</p>
        )}
      </form>

      {/* Submission history */}
      <section>
        <h2 className="text-sm font-semibold text-neutral-300 mb-3">
          제보 히스토리 ({submissions.length})
        </h2>
        {submissions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-800 p-8 text-center text-sm text-neutral-500">
            아직 제보가 없습니다
          </div>
        ) : (
          <div className="space-y-2">
            {submissions.map((sub) => (
              <SubmissionRow key={sub.id} sub={sub} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
