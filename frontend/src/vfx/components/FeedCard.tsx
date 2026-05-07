import { useState } from "react";
import { Bookmark, BookmarkCheck, ExternalLink, MessageSquare } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FeedItem } from "../types";
import { toggleSave } from "../api/feed";
import { badgeStyle } from "../design";

const SOURCE_META: Record<string, { bg: string; color: string; label: string }> = {
  firecrawl: { bg: "#f3e8ff", color: "#6b21a8", label: "웹" },
  reddit:    { bg: "#ffedd5", color: "#c2410c", label: "Reddit" },
  x:         { bg: "#e0f2fe", color: "#0369a1", label: "X" },
  hf_space:  { bg: "#fef3c7", color: "#92400e", label: "HF" },
  manual:    { bg: "#f1f5f9", color: "#475569", label: "수동" },
};

export default function FeedCard({ item }: { item: FeedItem }) {
  const [hover, setHover] = useState(false);
  const qc = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: () => toggleSave(item.id, !item.is_saved),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feed"] }),
  });

  const src = SOURCE_META[item.source] || SOURCE_META.manual;
  const meta = item.feed_metadata as Record<string, unknown>;
  const subreddit = meta?.subreddit as string | undefined;
  const score = meta?.score as number | undefined;
  const numComments = meta?.num_comments as number | undefined;

  return (
    <article
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: "var(--color-card)",
        border: `1px solid ${hover ? "var(--color-accent)" : "var(--color-border)"}`,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: hover ? "0 4px 12px rgba(79,70,229,0.10)" : "0 1px 2px rgba(0,0,0,0.02)",
        transition: "all 0.15s",
      }}
    >
      {item.image_url && (
        <a href={item.url} target="_blank" rel="noopener noreferrer"
          style={{ display: "block", aspectRatio: "16/9", background: "#f1f5f9", overflow: "hidden" }}>
          <img
            src={item.image_url} alt=""
            style={{
              width: "100%", height: "100%", objectFit: "cover",
              transform: hover ? "scale(1.04)" : "none",
              transition: "transform 0.3s",
            }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </a>
      )}

      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
          <span style={badgeStyle(src.bg, src.color)}>
            {src.label}
            {subreddit && <span style={{ opacity: 0.7, marginLeft: 4 }}>r/{subreddit}</span>}
          </span>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); saveMutation.mutate(); }}
            disabled={saveMutation.isPending}
            title={item.is_saved ? "저장 해제" : "북마크"}
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: item.is_saved ? "var(--color-warning)" : "var(--color-text-muted)",
              opacity: saveMutation.isPending ? 0.5 : 1,
              display: "inline-flex",
            }}
          >
            {item.is_saved ? <BookmarkCheck style={{ width: 16, height: 16, fill: "currentColor", fillOpacity: 0.2 }} /> : <Bookmark style={{ width: 16, height: 16 }} />}
          </button>
        </div>

        <h3 style={{
          fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)",
          marginBottom: 6, lineHeight: 1.4,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          <a href={item.url} target="_blank" rel="noopener noreferrer"
            style={{ color: "inherit", textDecoration: "none" }}>
            {item.title}
          </a>
        </h3>

        {item.excerpt && (
          <p style={{
            fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5,
            marginBottom: 12,
            display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>
            {item.excerpt}
          </p>
        )}

        {item.tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
            {item.tags.slice(0, 4).map((tag) => (
              <span key={tag} style={{
                padding: "2px 8px", borderRadius: 6, fontSize: 11,
                background: "#f1f5f9", color: "var(--color-text-muted)",
              }}>
                #{tag}
              </span>
            ))}
          </div>
        )}

        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          paddingTop: 10, borderTop: "1px solid #f1f5f9",
          fontSize: 11, color: "var(--color-text-muted)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>{new Date(item.discovered_at).toLocaleDateString("ko-KR")}</span>
            {item.author && <span>· {item.author}</span>}
            {typeof score === "number" && <span>· ⬆{score}</span>}
            {typeof numComments === "number" && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                · <MessageSquare style={{ width: 11, height: 11 }} /> {numComments}
              </span>
            )}
          </div>
          <a href={item.url} target="_blank" rel="noopener noreferrer"
            style={{ color: "var(--color-text-muted)", display: "inline-flex" }}>
            <ExternalLink style={{ width: 12, height: 12 }} />
          </a>
        </div>
      </div>
    </article>
  );
}
