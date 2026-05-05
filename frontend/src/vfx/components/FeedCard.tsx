import { Bookmark, BookmarkCheck, ExternalLink, MessageSquare } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FeedItem } from "../types";
import { toggleSave } from "../api/feed";

const SOURCE_STYLES: Record<FeedItem["source"], { bg: string; label: string }> = {
  firecrawl: { bg: "bg-purple-500/10 text-purple-300 border-purple-500/30", label: "웹" },
  reddit: { bg: "bg-orange-500/10 text-orange-300 border-orange-500/30", label: "Reddit" },
  x: { bg: "bg-sky-500/10 text-sky-300 border-sky-500/30", label: "X" },
  hf_space: { bg: "bg-yellow-500/10 text-yellow-300 border-yellow-500/30", label: "HF" },
  manual: { bg: "bg-neutral-500/10 text-neutral-300 border-neutral-500/30", label: "수동" },
};

export default function FeedCard({ item }: { item: FeedItem }) {
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: () => toggleSave(item.id, !item.is_saved),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  const sourceStyle = SOURCE_STYLES[item.source] ?? SOURCE_STYLES.manual;
  const meta = item.feed_metadata as Record<string, unknown>;
  const subreddit = meta?.subreddit as string | undefined;
  const score = meta?.score as number | undefined;
  const numComments = meta?.num_comments as number | undefined;

  return (
    <article className="rounded-lg border border-neutral-800 bg-neutral-900 overflow-hidden hover:border-brand-500/50 transition group">
      {item.image_url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block aspect-video bg-neutral-950 overflow-hidden"
        >
          <img
            src={item.image_url}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </a>
      )}

      <div className="p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${sourceStyle.bg}`}
            >
              {sourceStyle.label}
              {subreddit && <span className="ml-1 opacity-70">r/{subreddit}</span>}
            </span>
          </div>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              saveMutation.mutate();
            }}
            disabled={saveMutation.isPending}
            className="text-neutral-500 hover:text-amber-400 transition disabled:opacity-50"
            title={item.is_saved ? "저장 해제" : "북마크"}
          >
            {item.is_saved ? (
              <BookmarkCheck className="h-4 w-4 text-amber-400 fill-amber-400/20" />
            ) : (
              <Bookmark className="h-4 w-4" />
            )}
          </button>
        </div>

        <h3 className="text-sm font-semibold text-neutral-100 mb-1 line-clamp-2">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-brand-300"
          >
            {item.title}
          </a>
        </h3>

        {item.excerpt && (
          <p className="text-xs text-neutral-400 line-clamp-3 mb-3">{item.excerpt}</p>
        )}

        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {item.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="inline-block rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 text-[10px] text-neutral-500 pt-2 border-t border-neutral-800">
          <div className="flex items-center gap-2">
            <span>{new Date(item.discovered_at).toLocaleDateString("ko-KR")}</span>
            {item.author && <span>· {item.author}</span>}
            {typeof score === "number" && <span>· ⬆{score}</span>}
            {typeof numComments === "number" && (
              <span className="inline-flex items-center gap-0.5">
                · <MessageSquare className="h-3 w-3" />
                {numComments}
              </span>
            )}
          </div>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-neutral-300"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </article>
  );
}
