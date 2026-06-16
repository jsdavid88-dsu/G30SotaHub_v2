// 통합 연구 피드 — 전체/분야/학생 필터로 랩의 연구 활동을 한 흐름으로.
// 데일리(모델 연결) + 리뷰 + 테스트 자료가 시간순. 모델 제목 클릭 → 그 모델 페이지(per-model 피드).
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { FileText, MessageSquareText, Film, Image as ImageIcon } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchResearchFeed, fetchWeeklyReport, generateWeeklyReport, type FeedScope, type ResearchLogEntry } from "../api/comments";
import { fetchCategories } from "../api/categories";
import { cardStyle } from "../design";
import MediaViewer, { type MediaItem } from "../../components/MediaViewer";
import { authMediaUrl } from "../../api/media";
import { useRole, isPrivileged } from "../../contexts/RoleContext";

const sectionLabel: Record<string, string> = { yesterday: "어제", today: "오늘", issue: "이슈", misc: "메모" };
function typeMeta(t: string) {
  if (t === "daily") return { icon: FileText, label: "데일리", color: "#4f46e5" };
  if (t === "review") return { icon: MessageSquareText, label: "리뷰", color: "#0891b2" };
  return { icon: Film, label: "테스트 자료", color: "#7c3aed" };
}

type Student = { id: string; name: string; email: string };

export default function ResearchFeed({ embedded = false }: { embedded?: boolean } = {}) {
  const { currentRole } = useRole();
  const privileged = isPrivileged(currentRole);
  const [scope, setScope] = useState<FeedScope>(privileged ? "all" : "student");
  const [category, setCategory] = useState<string>("");
  const [studentId, setStudentId] = useState<string>("");
  const [contentKind, setContentKind] = useState<"all" | "media">("all");  // 전체 vs 자료(영상/이미지)만
  const [viewer, setViewer] = useState<MediaItem | null>(null);
  const [students, setStudents] = useState<Student[]>([]);

  const { data: categories = [] } = useQuery({ queryKey: ["vfx-categories"], queryFn: fetchCategories });
  const qc = useQueryClient();
  const { data: weekly } = useQuery({ queryKey: ["weekly-report"], queryFn: fetchWeeklyReport });
  const genWeekly = useMutation({
    mutationFn: generateWeeklyReport,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["weekly-report"] }),
  });

  // 학생 목록 (운영진만 — 학생 필터용). Hub /users 직접 호출.
  useEffect(() => {
    if (!privileged) return;
    const token = localStorage.getItem("token");
    fetch("/api/v1/users/?role=student", { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setStudents(Array.isArray(d) ? d : d?.data || []))
      .catch(() => {});
  }, [privileged]);

  // 비운영진은 본인 학생 피드 고정
  const me = (() => { try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; } })();
  const effectiveStudentId = privileged ? studentId : me?.id;

  const queryParams = {
    scope,
    category: scope === "category" ? category : undefined,
    student_id: scope === "student" ? (effectiveStudentId || undefined) : undefined,
  };
  const enabled = scope !== "category" ? true : !!category;
  const enabledStudent = scope !== "student" ? true : !!effectiveStudentId;

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["research-feed", queryParams.scope, queryParams.category, queryParams.student_id],
    queryFn: () => fetchResearchFeed(queryParams),
    enabled: enabled && enabledStudent,
  });

  // 콘텐츠 종류 필터 — '자료만'이면 영상/이미지(type=media)만
  const visibleEntries = contentKind === "media" ? entries.filter((e) => e.type === "media") : entries;

  const toMedia = (e: ResearchLogEntry): MediaItem => ({
    id: e.attachment_id || e.id, media_type: e.media_type || "other", mime: e.mime,
    file_name: e.file_name, stream_url: e.stream_url || "", fps: e.fps ?? null, preview_status: e.preview_status ?? null,
  });

  const chip = (active: boolean): React.CSSProperties => ({
    padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer",
    background: active ? "var(--color-accent, #4f46e5)" : "#fff",
    color: active ? "#fff" : "#64748b", boxShadow: active ? "none" : "inset 0 0 0 1px var(--color-border, #e2e8f0)",
  });

  return (
    <div style={{ maxWidth: 880, margin: embedded ? "0" : "0 auto" }}>
      {!embedded && (
        <>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text-primary, #0f172a)", marginBottom: 4 }}>연구 피드</h1>
          <p style={{ fontSize: 13, color: "var(--color-text-muted, #64748b)", marginBottom: 16 }}>
            데일리(모델 연결) · 리뷰 · 테스트 자료를 한 흐름으로. 필터로 전체/분야/학생을 전환.
          </p>
        </>
      )}

      {/* 주간 자동 리포트 (outputs tier) */}
      <div style={{
        background: "linear-gradient(135deg, #faf5ff, #eef2ff)", border: "1px solid #e9d5ff",
        borderRadius: 14, padding: 16, marginBottom: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: weekly ? 8 : 0, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#7c3aed" }}>📊 주간 연구 리포트</span>
          {weekly && <span style={{ fontSize: 11, color: "#94a3b8" }}>{weekly.period_start} ~ {weekly.period_end}</span>}
          {privileged && (
            <button onClick={() => genWeekly.mutate()} disabled={genWeekly.isPending}
              style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 8,
                border: "1px solid #c4b5fd", background: "#fff", color: "#7c3aed", cursor: "pointer" }}>
              {genWeekly.isPending ? "Arca 작성 중…" : "이번 주 생성"}
            </button>
          )}
        </div>
        {weekly ? (
          <>
            <p style={{ fontSize: 13, color: "#581c87", lineHeight: 1.6, margin: "0 0 8px", whiteSpace: "pre-wrap" }}>
              {weekly.content.summary}
            </p>
            {weekly.content.totals && (
              <div style={{ display: "flex", gap: 14, fontSize: 11, color: "#7c3aed", flexWrap: "wrap" }}>
                <span>신규 모델 {weekly.content.totals.new_models}</span>
                <span>데일리 {weekly.content.totals.daily_blocks}</span>
                <span>리뷰 {weekly.content.totals.reviews}</span>
                <span>컨펌 {weekly.content.totals.confirms}</span>
              </div>
            )}
          </>
        ) : (
          <p style={{ fontSize: 12, color: "#a78bda", margin: 0 }}>
            아직 생성된 주간 리포트가 없습니다. {privileged ? '"이번 주 생성"을 누르거나 매주 월요일 자동 생성됩니다.' : "매주 월요일 자동 생성됩니다."}
          </p>
        )}
      </div>

      {/* 필터 */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 20 }}>
        {privileged && <button style={chip(scope === "all")} onClick={() => setScope("all")}>전체</button>}
        <button style={chip(scope === "category")} onClick={() => setScope("category")}>분야별</button>
        <button style={chip(scope === "student")} onClick={() => setScope("student")}>{privileged ? "학생별" : "내 연구"}</button>

        {scope === "category" && (
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--color-border, #e2e8f0)", fontSize: 13 }}>
            <option value="">분야 선택…</option>
            {categories.map((c: any) => <option key={c.slug} value={c.slug}>{c.name || c.slug}</option>)}
          </select>
        )}
        {scope === "student" && privileged && (
          <select value={studentId} onChange={(e) => setStudentId(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--color-border, #e2e8f0)", fontSize: 13 }}>
            <option value="">학생 선택…</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}

        {/* 콘텐츠 종류 — 전체 vs 자료(영상/이미지)만 갤러리 */}
        <div style={{ marginLeft: "auto", display: "inline-flex", gap: 4, background: "#fff", border: "1px solid var(--color-border, #e2e8f0)", borderRadius: 8, padding: 3 }}>
          {([["all", "전체"], ["media", "🎬 자료만"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setContentKind(k)}
              style={{ padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
                background: contentKind === k ? "var(--color-accent, #4f46e5)" : "transparent",
                color: contentKind === k ? "#fff" : "var(--color-text-muted, #64748b)" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 피드 */}
      {(scope === "category" && !category) || (scope === "student" && !effectiveStudentId) ? (
        <div style={{ ...cardStyle, padding: 32, textAlign: "center", color: "var(--color-text-muted, #94a3b8)", fontSize: 13 }}>
          {scope === "category" ? "분야를 선택하세요." : "학생을 선택하세요."}
        </div>
      ) : isLoading ? (
        <p style={{ fontSize: 13, color: "var(--color-text-muted, #94a3b8)" }}>불러오는 중…</p>
      ) : visibleEntries.length === 0 ? (
        <div style={{ ...cardStyle, padding: 32, textAlign: "center", color: "var(--color-text-muted, #94a3b8)", fontSize: 13 }}>
          {contentKind === "media" ? "이 범위에 올라온 영상/이미지 자료가 없습니다." : "이 범위에는 아직 연구 활동이 없습니다."}
        </div>
      ) : contentKind === "media" ? (
        /* 자료만 — 영상/이미지 갤러리 그리드 */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
          {visibleEntries.map((e) => (
            <button key={e.id} onClick={() => setViewer(toMedia(e))}
              style={{ textAlign: "left", padding: 0, borderRadius: 12, overflow: "hidden", cursor: "pointer",
                border: "1px solid var(--color-border, #e2e8f0)", background: "#fff" }}>
              <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 3", background: "#e2e8f0" }}>
                {e.thumbnail_url ? (
                  <img src={authMediaUrl(e.thumbnail_url)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                ) : (
                  <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {e.media_type === "video" ? <Film style={{ width: 30, height: 30, color: "#94a3b8" }} /> : <ImageIcon style={{ width: 30, height: 30, color: "#94a3b8" }} />}
                  </span>
                )}
                {e.media_type === "video" && (
                  <span style={{ position: "absolute", top: 6, right: 6, fontSize: 10, fontWeight: 700, color: "#fff", background: "rgba(15,23,42,0.7)", padding: "2px 6px", borderRadius: 99 }}>▶ 영상</span>
                )}
              </div>
              <div style={{ padding: "8px 10px" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary, #0f172a)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.file_name || "미디어"}
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-muted, #94a3b8)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.author_name || "—"}{e.item_title ? ` · ${e.item_title}` : ""}
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visibleEntries.map((e) => {
            const m = typeMeta(e.type);
            return (
              <div key={e.id} style={{ ...cardStyle, padding: "12px 16px", borderLeft: `3px solid ${m.color}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                  <m.icon style={{ width: 14, height: 14, color: m.color }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: m.color }}>{m.label}</span>
                  {e.type === "daily" && e.section && <span style={{ fontSize: 10, color: "#94a3b8" }}>· {sectionLabel[e.section] || e.section}</span>}
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary, #0f172a)" }}>{e.author_name || "—"}</span>
                  {e.item_id != null && (
                    <Link to={`/vfx/item/${e.item_id}`} style={{ fontSize: 11, color: "#7c3aed", textDecoration: "none", background: "#faf5ff", padding: "1px 8px", borderRadius: 99 }}>
                      {e.item_title || `모델 #${e.item_id}`}
                    </Link>
                  )}
                  <span style={{ fontSize: 11, color: "var(--color-text-muted, #94a3b8)", marginLeft: "auto" }}>
                    {e.created_at ? new Date(e.created_at).toLocaleString("ko-KR") : ""}
                  </span>
                </div>
                {e.type === "media" ? (
                  <button onClick={() => setViewer(toMedia(e))}
                    style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8, border: "1px solid var(--color-border, #e2e8f0)", background: "#f8fafc", cursor: "pointer", maxWidth: "100%" }}>
                    {e.thumbnail_url ? (
                      <img src={authMediaUrl(e.thumbnail_url)} alt="" style={{ width: 48, height: 48, borderRadius: 6, objectFit: "cover", background: "#e2e8f0" }} />
                    ) : (
                      <span style={{ width: 48, height: 48, borderRadius: 6, background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {e.media_type === "video" ? <Film style={{ width: 18, height: 18, color: "#64748b" }} /> : <ImageIcon style={{ width: 18, height: 18, color: "#64748b" }} />}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: "var(--color-text-secondary, #475569)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.file_name || "미디어"} {e.media_type === "video" ? "· 열어서 프레임 노트" : ""}
                    </span>
                  </button>
                ) : (
                  <p style={{ fontSize: 14, color: "var(--color-text-secondary, #475569)", whiteSpace: "pre-wrap", lineHeight: 1.5, margin: 0 }}>{e.content}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <MediaViewer item={viewer} onClose={() => setViewer(null)} />
    </div>
  );
}
