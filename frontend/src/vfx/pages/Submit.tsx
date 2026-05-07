// VFX Submit — Hub design language
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Link2, Search, Clock, CheckCircle, XCircle, Loader2, Inbox } from "lucide-react";
import {
  createSubmission, fetchSubmissions, fetchSubmissionStats,
  type Submission,
} from "../api/submissions";

const cardStyle: React.CSSProperties = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 16,
  boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
};

const sectionHeaderStyle: React.CSSProperties = {
  padding: "20px 28px",
  borderBottom: "1px solid #f1f5f9",
};

const sectionTitleStyle: React.CSSProperties = {
  fontWeight: 600, fontSize: 17, color: "var(--color-text-primary)",
};

const sectionSubtitleStyle: React.CSSProperties = {
  fontSize: 13, color: "var(--color-text-muted)", marginTop: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 10,
  border: "1px solid var(--color-border)", fontSize: 14,
  background: "#fff", color: "var(--color-text-primary)",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 600,
  color: "var(--color-text-secondary)", marginBottom: 8,
};

const STATUS_META: Record<string, { icon: React.ElementType; bg: string; color: string; label: string }> = {
  pending:    { icon: Clock,       bg: "var(--color-warning-light)", color: "var(--color-warning)", label: "대기" },
  processing: { icon: Loader2,     bg: "#dbeafe",                    color: "#1d4ed8",              label: "조사중" },
  done:       { icon: CheckCircle, bg: "var(--color-success-light)", color: "var(--color-success)", label: "완료" },
  rejected:   { icon: XCircle,     bg: "var(--color-danger-light)",  color: "var(--color-danger)",  label: "거절" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_META[status] || STATUS_META.pending;
  const Icon = s.icon;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 10px", borderRadius: 99,
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 600,
    }}>
      <Icon style={{ width: 12, height: 12, animation: status === "processing" ? "spin 1s linear infinite" : "none" }} />
      {s.label}
    </span>
  );
}

function SubmissionRow({ sub }: { sub: Submission }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "16px 24px",
        borderBottom: "1px solid #f1f5f9",
        background: hover ? "#f8fafc" : "transparent",
        transition: "background 0.15s",
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: sub.input_type === "url" ? "var(--color-accent-light)" : "#f3e8ff",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        {sub.input_type === "url"
          ? <Link2 style={{ width: 16, height: 16, color: "var(--color-accent)" }} />
          : <Search style={{ width: 16, height: 16, color: "#7c3aed" }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {sub.input_value}
        </div>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
          {sub.submitted_by || "익명"} · {new Date(sub.created_at).toLocaleString("ko-KR")}
          {sub.reject_reason && <span style={{ color: "var(--color-danger)" }}> · {sub.reject_reason}</span>}
        </div>
      </div>
      <StatusBadge status={sub.status} />
      {sub.result_item_id && (
        <Link to={`/vfx/item/${sub.result_item_id}`} style={{
          fontSize: 12, fontWeight: 600, color: "var(--color-accent)",
          textDecoration: "none", whiteSpace: "nowrap",
        }}>
          결과 보기 →
        </Link>
      )}
    </div>
  );
}

export default function Submit() {
  const qc = useQueryClient();
  const [inputType, setInputType] = useState<"url" | "keyword">("url");
  const [inputValue, setInputValue] = useState("");
  const [submittedBy, setSubmittedBy] = useState("");

  const { data: stats } = useQuery({ queryKey: ["submission-stats"], queryFn: fetchSubmissionStats });
  const { data: submissions = [] } = useQuery({ queryKey: ["submissions"], queryFn: () => fetchSubmissions() });

  const mutation = useMutation({
    mutationFn: createSubmission,
    onSuccess: () => {
      setInputValue("");
      qc.invalidateQueries({ queryKey: ["submissions"] });
      qc.invalidateQueries({ queryKey: ["submission-stats"] });
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

  const tabBtn = (active: boolean, color: string): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 8,
    padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
    background: active ? color : "#fff",
    color: active ? "#fff" : "var(--color-text-secondary)",
    border: active ? "none" : "1px solid var(--color-border)",
    cursor: "pointer", transition: "all 0.15s",
  });

  return (
    <div style={{ width: "100%" }}>
      {/* Greeting */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 26, fontWeight: 600, color: "var(--color-text-primary)", fontFamily: "var(--font-display)" }}>
          제보
        </h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: 15, marginTop: 6, lineHeight: 1.5 }}>
          URL 이나 키워드를 제출하면 <span style={{ color: "var(--color-accent)", fontWeight: 500 }}>아르카</span> 가 야간 배치에서 조사합니다.
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12, marginBottom: 24,
        }}>
          {Object.entries(STATUS_META).map(([key, s]) => {
            const count = (stats as Record<string, number>)[key] ?? 0;
            const Icon = s.icon;
            return (
              <div key={key} style={{ ...cardStyle, padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: s.bg,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon style={{ width: 18, height: 18, color: s.color }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)" }}>{s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)", lineHeight: 1.1, marginTop: 2 }}>
                    {count}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Submit form card */}
      <div style={{ ...cardStyle, marginBottom: 24, overflow: "hidden" }}>
        <div style={sectionHeaderStyle}>
          <div style={sectionTitleStyle}>새 제보</div>
          <div style={sectionSubtitleStyle}>URL / 키워드 제출 · 야간 배치에서 자동 조사</div>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <label style={labelStyle}>제보 종류</label>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setInputType("url")} style={tabBtn(inputType === "url", "var(--color-accent)")}>
                <Link2 style={{ width: 14, height: 14 }} /> URL
              </button>
              <button type="button" onClick={() => setInputType("keyword")} style={tabBtn(inputType === "keyword", "#7c3aed")}>
                <Search style={{ width: 14, height: 14 }} /> 키워드
              </button>
            </div>
          </div>

          <div>
            <label style={labelStyle}>{inputType === "url" ? "링크 주소" : "검색 키워드"}</label>
            <input
              type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)}
              placeholder={inputType === "url" ? "https://arxiv.org/abs/...   또는 GitHub / HuggingFace URL" : "예: comfyui video inpainting workflow"}
              style={inputStyle}
            />
          </div>

          <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
            <div style={{ flex: 1, maxWidth: 280 }}>
              <label style={{ ...labelStyle, fontSize: 12 }}>이름 (선택)</label>
              <input
                type="text" value={submittedBy} onChange={(e) => setSubmittedBy(e.target.value)}
                placeholder="익명" style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }} />
            <button
              type="submit" disabled={!inputValue.trim() || mutation.isPending}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "10px 20px", borderRadius: 10, fontSize: 14, fontWeight: 600,
                background: "var(--color-accent)", color: "#fff",
                border: "none", cursor: "pointer",
                opacity: !inputValue.trim() || mutation.isPending ? 0.5 : 1,
              }}
            >
              <Send style={{ width: 14, height: 14 }} />
              {mutation.isPending ? "제출중..." : "제출"}
            </button>
          </div>

          {mutation.isError && (
            <div style={{
              padding: "10px 14px", borderRadius: 10,
              background: "var(--color-danger-light)", color: "var(--color-danger)",
              fontSize: 13,
            }}>
              {(mutation.error as Error).message}
            </div>
          )}
          {mutation.isSuccess && (
            <div style={{
              padding: "10px 14px", borderRadius: 10,
              background: "var(--color-success-light)", color: "var(--color-success)",
              fontSize: 13,
            }}>
              ✓ 제출 완료 — 다음 야간 배치에서 처리됩니다.
            </div>
          )}
        </form>
      </div>

      {/* History */}
      <div style={{ ...cardStyle, overflow: "hidden" }}>
        <div style={sectionHeaderStyle}>
          <div style={sectionTitleStyle}>
            제보 히스토리 <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>({submissions.length})</span>
          </div>
        </div>
        {submissions.length === 0 ? (
          <div style={{ padding: "48px 28px", textAlign: "center" }}>
            <div style={{
              display: "inline-flex", padding: 12, borderRadius: 12,
              background: "#f1f5f9", marginBottom: 12,
            }}>
              <Inbox style={{ width: 28, height: 28, color: "var(--color-text-muted)" }} />
            </div>
            <p style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-secondary)" }}>아직 제보가 없습니다</p>
            <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>위 폼에서 첫 제보를 남겨보세요</p>
          </div>
        ) : (
          <div>
            {submissions.map((sub) => <SubmissionRow key={sub.id} sub={sub} />)}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
