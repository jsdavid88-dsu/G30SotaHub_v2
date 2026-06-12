// 연구 기록 피드 — 한 모델에 대한 우리 랩의 활동을 시간순 한 흐름으로.
// 데일리 블록(연결됨) + SOTA 리뷰 + 테스트 자료(영상/이미지 → 프레임 노트).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, MessageSquareText, Film, Image as ImageIcon } from "lucide-react";
import { fetchResearchLog, type ResearchLogEntry } from "../api/comments";
import { cardStyle, sectionHeaderStyle } from "../design";
import MediaViewer, { type MediaItem } from "../../components/MediaViewer";
import { authMediaUrl } from "../../api/media";

const sectionLabel: Record<string, string> = {
  yesterday: "어제", today: "오늘", issue: "이슈", misc: "메모",
};

function typeMeta(t: string) {
  if (t === "daily") return { icon: FileText, label: "데일리", color: "#4f46e5" };
  if (t === "review") return { icon: MessageSquareText, label: "리뷰", color: "#0891b2" };
  return { icon: Film, label: "테스트 자료", color: "#7c3aed" };
}

export default function ResearchLog({ itemId }: { itemId: number }) {
  const [viewer, setViewer] = useState<MediaItem | null>(null);
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["research-log", itemId],
    queryFn: () => fetchResearchLog(itemId),
  });

  const toMedia = (e: ResearchLogEntry): MediaItem => ({
    id: e.attachment_id || e.id,
    media_type: e.media_type || "other",
    mime: e.mime,
    file_name: e.file_name,
    stream_url: e.stream_url || "",
    fps: e.fps ?? null,
    preview_status: e.preview_status ?? null,
  });

  return (
    <section style={{ ...cardStyle, overflow: "hidden" }}>
      <div style={{ ...sectionHeaderStyle, display: "flex", alignItems: "center", gap: 8 }}>
        <FileText style={{ width: 16, height: 16, color: "var(--color-accent)" }} />
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>
          연구 기록 <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>({entries.length})</span>
        </div>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)", marginLeft: "auto" }}>
          데일리·리뷰·테스트 자료 모음
        </span>
      </div>

      <div style={{ padding: 20 }}>
        {isLoading ? (
          <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>불러오는 중…</p>
        ) : entries.length === 0 ? (
          <div style={{
            padding: 24, textAlign: "center", fontSize: 13, color: "var(--color-text-muted)",
            border: "1px dashed var(--color-border)", borderRadius: 12,
          }}>
            아직 연구 기록이 없습니다. 데일리 블록에서 이 모델을 연결하거나, 배정 리뷰·테스트 자료를 올리면 여기 모입니다.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {entries.map((e) => {
              const m = typeMeta(e.type);
              return (
                <div key={e.id} style={{
                  padding: "12px 16px", borderRadius: 12,
                  background: "#fff", border: "1px solid var(--color-border)",
                  borderLeft: `3px solid ${m.color}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                    <m.icon style={{ width: 14, height: 14, color: m.color }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: m.color }}>{m.label}</span>
                    {e.type === "daily" && e.section && (
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>· {sectionLabel[e.section] || e.section}</span>
                    )}
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>
                      {e.author_name || "—"}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--color-text-muted)", marginLeft: "auto" }}>
                      {e.created_at ? new Date(e.created_at).toLocaleString("ko-KR") : ""}
                    </span>
                  </div>

                  {e.type === "media" ? (
                    <button
                      onClick={() => setViewer(toMedia(e))}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 8px",
                        borderRadius: 8, border: "1px solid var(--color-border)", background: "#f8fafc",
                        cursor: "pointer", maxWidth: "100%",
                      }}
                    >
                      {e.thumbnail_url ? (
                        <img src={authMediaUrl(e.thumbnail_url)} alt="" style={{ width: 48, height: 48, borderRadius: 6, objectFit: "cover", background: "#e2e8f0" }} />
                      ) : (
                        <span style={{ width: 48, height: 48, borderRadius: 6, background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {e.media_type === "video" ? <Film style={{ width: 18, height: 18, color: "#64748b" }} /> : <ImageIcon style={{ width: 18, height: 18, color: "#64748b" }} />}
                        </span>
                      )}
                      <span style={{ fontSize: 12, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {e.file_name || "미디어"} {e.media_type === "video" ? "· 열어서 프레임 노트" : ""}
                      </span>
                    </button>
                  ) : (
                    <p style={{ fontSize: 14, color: "var(--color-text-secondary)", whiteSpace: "pre-wrap", lineHeight: 1.5, margin: 0 }}>
                      {e.content}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <MediaViewer item={viewer} onClose={() => setViewer(null)} />
    </section>
  );
}
