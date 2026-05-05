import { Link } from "react-router-dom";
import { ExternalLink, Star, Github } from "lucide-react";
import type { Item } from "../types";
import { getCodeLinks, getArcaVerdict } from "../utils/metadata";
import SourceBadge from "./SourceBadge";
import PriorityBadge from "./PriorityBadge";

export default function ItemCard({
  item,
  groupSources,
}: {
  item: Item;
  groupSources?: Item["source"][];
}) {
  const score = item.llm_score || item.keyword_score;
  const codeLinks = getCodeLinks(item);
  const verdict = getArcaVerdict(item);
  // Other sources in the same group (excluding current)
  const otherSources = groupSources?.filter((s) => s !== item.source) ?? [];

  return (
    <Link
      to={`/item/${item.id}`}
      className="block rounded-lg border border-neutral-800 bg-neutral-900 p-4 hover:border-brand-500/50 transition"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <SourceBadge source={item.source} />
          {otherSources.map((s) => (
            <SourceBadge key={s} source={s} muted />
          ))}
          <PriorityBadge priority={item.priority} />
          {score > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-400">
              <Star className="h-3 w-3 fill-current" />
              {score}
            </span>
          )}
        </div>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-neutral-500 hover:text-neutral-300"
          title="원문 열기"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <h3 className="text-sm font-semibold text-neutral-100 mb-1 line-clamp-2">{item.title}</h3>

      {verdict ? (
        <p className="text-xs text-brand-300 line-clamp-2 mb-2 italic">
          💭 {verdict}
        </p>
      ) : item.abstract ? (
        <p className="text-xs text-neutral-400 line-clamp-2 mb-2">{item.abstract}</p>
      ) : null}

      {codeLinks.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {codeLinks.slice(0, 3).map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300 hover:bg-emerald-500/20"
              title={link.description || link.name}
            >
              <Github className="h-3 w-3" />
              <span className="truncate max-w-[100px]">{link.name.split("/")[1] || link.name}</span>
              {link.stars > 0 && <span className="opacity-70">★{link.stars}</span>}
            </a>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 text-[10px] text-neutral-500">
        <span>{new Date(item.discovered_at).toLocaleDateString("ko-KR")}</span>
        {item.category_slugs.length > 0 && <span>· {item.category_slugs.join(", ")}</span>}
      </div>
    </Link>
  );
}
