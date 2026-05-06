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

const STATUS_STYLES: Record<string, { icon: React.ElementType; iconColor: string; bg: string; ring: string; text: string; label: string }> = {
  pending:    { icon: Clock,       iconColor: "text-amber-600",   bg: "bg-amber-50",   ring: "border-amber-200",   text: "text-amber-700",   label: "대기" },
  processing: { icon: Loader2,     iconColor: "text-blue-600",    bg: "bg-blue-50",    ring: "border-blue-200",    text: "text-blue-700",    label: "조사중" },
  done:       { icon: CheckCircle, iconColor: "text-emerald-600", bg: "bg-emerald-50", ring: "border-emerald-200", text: "text-emerald-700", label: "완료" },
  rejected:   { icon: XCircle,     iconColor: "text-rose-600",    bg: "bg-rose-50",    ring: "border-rose-200",    text: "text-rose-700",    label: "거절" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.pending;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium border ${s.bg} ${s.ring} ${s.text}`}>
      <Icon className={`h-3.5 w-3.5 ${status === "processing" ? "animate-spin" : ""}`} />
      {s.label}
    </span>
  );
}

function SubmissionRow({ sub }: { sub: Submission }) {
  return (
    <div className="flex items-center gap-4 rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm transition px-5 py-4">
      <div className="flex-shrink-0 rounded-lg bg-slate-100 p-2.5">
        {sub.input_type === "url" ? (
          <Link2 className="h-4 w-4 text-indigo-600" />
        ) : (
          <Search className="h-4 w-4 text-purple-600" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-900 truncate font-medium">{sub.input_value}</div>
        <div className="text-xs text-slate-500 mt-0.5">
          {sub.submitted_by || "익명"} · {new Date(sub.created_at).toLocaleString("ko-KR")}
          {sub.reject_reason && (
            <span className="text-rose-600"> · {sub.reject_reason}</span>
          )}
        </div>
      </div>
      <StatusBadge status={sub.status} />
      {sub.result_item_id && (
        <Link
          to={`/vfx/item/${sub.result_item_id}`}
          className="text-xs text-indigo-600 hover:text-indigo-700 whitespace-nowrap font-medium"
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
    <div className="space-y-8">
      {/* 헤딩 */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">제보</h1>
        <p className="text-base text-slate-500 mt-1.5">
          URL 이나 키워드를 제출하면 <span className="text-indigo-600 font-medium">아르카</span> 가 야간 배치에서 조사합니다.
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(STATUS_STYLES).map(([key, s]) => {
            const count = (stats as Record<string, number>)[key] ?? 0;
            const Icon = s.icon;
            return (
              <div key={key} className={`flex items-center gap-3 rounded-xl border p-4 ${s.bg} ${s.ring}`}>
                <Icon className={`h-5 w-5 ${s.iconColor}`} />
                <div>
                  <div className={`text-xs font-medium ${s.text}`}>{s.label}</div>
                  <div className="text-2xl font-bold text-slate-900 mt-0.5">{count}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Submit form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl bg-white border border-slate-200 shadow-sm p-7 space-y-5"
      >
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-3">제보 종류</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setInputType("url")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                inputType === "url"
                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
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
                  ? "bg-purple-600 text-white shadow-sm shadow-purple-600/30"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Search className="h-4 w-4" />
              키워드
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
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
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition"
          />
        </div>

        <div className="flex items-end gap-3 pt-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">이름 (선택)</label>
            <input
              type="text"
              value={submittedBy}
              onChange={(e) => setSubmittedBy(e.target.value)}
              placeholder="익명"
              className="w-full max-w-xs rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition"
            />
          </div>
          <button
            type="submit"
            disabled={!inputValue.trim() || mutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 shadow-sm shadow-indigo-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <Send className="h-4 w-4" />
            {mutation.isPending ? "제출중..." : "제출"}
          </button>
        </div>

        {mutation.isError && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
            {(mutation.error as Error).message}
          </div>
        )}
        {mutation.isSuccess && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
            ✓ 제출 완료 — 다음 야간 배치에서 처리됩니다.
          </div>
        )}
      </form>

      {/* Submission history */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-900">
            제보 히스토리 <span className="text-slate-400 font-normal">({submissions.length})</span>
          </h2>
        </div>
        {submissions.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
            <div className="inline-flex rounded-2xl bg-slate-100 p-3 mb-4">
              <Inbox className="h-8 w-8 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-700">아직 제보가 없습니다</p>
            <p className="text-xs text-slate-500 mt-1">위 폼에서 첫 제보를 남겨보세요</p>
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
