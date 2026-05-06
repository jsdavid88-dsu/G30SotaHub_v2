import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Link2, Search, Clock, CheckCircle, XCircle, Loader2, Inbox } from "lucide-react";
import {
  createSubmission,
  fetchSubmissions,
  fetchSubmissionStats,
  type Submission,
} from "../api/submissions";

const STATUS_STYLES: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  pending:    { icon: Clock,       color: "text-amber-300",   bg: "bg-amber-500/10 border-amber-500/30",   label: "대기" },
  processing: { icon: Loader2,     color: "text-blue-300",    bg: "bg-blue-500/10 border-blue-500/30",     label: "조사중" },
  done:       { icon: CheckCircle, color: "text-emerald-300", bg: "bg-emerald-500/10 border-emerald-500/30", label: "완료" },
  rejected:   { icon: XCircle,     color: "text-red-300",     bg: "bg-red-500/10 border-red-500/30",       label: "거절" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.pending;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium border ${s.bg} ${s.color}`}>
      <Icon className={`h-3.5 w-3.5 ${status === "processing" ? "animate-spin" : ""}`} />
      {s.label}
    </span>
  );
}

function SubmissionRow({ sub }: { sub: Submission }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-neutral-800 bg-neutral-900/60 hover:bg-neutral-900 transition px-5 py-4">
      <div className="flex-shrink-0 rounded-lg bg-neutral-800 p-2.5">
        {sub.input_type === "url" ? (
          <Link2 className="h-4 w-4 text-brand-300" />
        ) : (
          <Search className="h-4 w-4 text-purple-300" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-neutral-100 truncate">{sub.input_value}</div>
        <div className="text-xs text-neutral-500 mt-0.5">
          {sub.submitted_by || "익명"} · {new Date(sub.created_at).toLocaleString("ko-KR")}
          {sub.reject_reason && (
            <span className="text-red-400"> · {sub.reject_reason}</span>
          )}
        </div>
      </div>
      <StatusBadge status={sub.status} />
      {sub.result_item_id && (
        <Link
          to={`/vfx/item/${sub.result_item_id}`}
          className="text-xs text-brand-300 hover:text-brand-200 whitespace-nowrap font-medium"
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
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* 헤딩 */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">제보</h1>
        <p className="text-base text-neutral-400 mt-2">
          URL 이나 키워드를 제출하면 <span className="text-brand-300">아르카</span> 가 야간 배치에서 조사합니다.
        </p>
      </div>

      {/* Stats — 카드형 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(STATUS_STYLES).map(([key, s]) => {
            const count = (stats as Record<string, number>)[key] ?? 0;
            const Icon = s.icon;
            return (
              <div
                key={key}
                className={`flex items-center gap-3 rounded-xl border p-4 ${s.bg}`}
              >
                <Icon className={`h-5 w-5 ${s.color}`} />
                <div>
                  <div className={`text-xs font-medium ${s.color}`}>{s.label}</div>
                  <div className="text-xl font-bold text-neutral-100 mt-0.5">{count}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Submit form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-900 to-neutral-950 p-7 space-y-5"
      >
        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-3">제보 종류</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setInputType("url")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                inputType === "url"
                  ? "bg-brand-600 text-white shadow-lg shadow-brand-600/30"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
              }`}
            >
              <Link2 className="h-4 w-4" />
              URL
            </button>
            <button
              type="button"
              onClick={() => setInputType("keyword")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                inputType === "keyword"
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
              }`}
            >
              <Search className="h-4 w-4" />
              키워드
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-2">
            {inputType === "url" ? "링크 주소" : "검색 키워드"}
          </label>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={
              inputType === "url"
                ? "https://arxiv.org/abs/...   또는 GitHub / HuggingFace URL"
                : "예: comfyui video inpainting workflow"
            }
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950/50 px-4 py-3 text-base text-neutral-100 placeholder-neutral-600 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition"
          />
        </div>

        <div className="flex items-end gap-3 pt-2">
          <div className="flex-1">
            <label className="block text-xs text-neutral-500 mb-1.5">이름 (선택)</label>
            <input
              type="text"
              value={submittedBy}
              onChange={(e) => setSubmittedBy(e.target.value)}
              placeholder="익명"
              className="w-full max-w-xs rounded-lg border border-neutral-700 bg-neutral-950/50 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 focus:border-brand-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={!inputValue.trim() || mutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-500 shadow-lg shadow-brand-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <Send className="h-4 w-4" />
            {mutation.isPending ? "제출중..." : "제출"}
          </button>
        </div>

        {mutation.isError && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
            {(mutation.error as Error).message}
          </div>
        )}
        {mutation.isSuccess && (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 text-sm text-emerald-300">
            ✓ 제출 완료 — 다음 야간 배치에서 처리됩니다.
          </div>
        )}
      </form>

      {/* Submission history */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-neutral-100">
            제보 히스토리 <span className="text-neutral-500 font-normal">({submissions.length})</span>
          </h2>
        </div>
        {submissions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/30 p-12 text-center">
            <Inbox className="h-10 w-10 mx-auto text-neutral-700 mb-3" />
            <p className="text-sm text-neutral-500">아직 제보가 없습니다</p>
            <p className="text-xs text-neutral-600 mt-1">위 폼에서 첫 제보를 남겨보세요</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {submissions.map((sub) => (
              <SubmissionRow key={sub.id} sub={sub} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
