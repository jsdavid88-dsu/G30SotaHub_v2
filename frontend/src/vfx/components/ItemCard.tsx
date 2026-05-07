import { useState } from "react";
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
  const [hover, setHover] = useState(false);
  const score = item.llm_score || item.keyword_score;
  const codeLinks = getCodeLinks(item);
  const verdict = getArcaVerdict(item);
  const otherSources = groupSources?.filter((s) => s !== item.source) ?? [];

  return (
    <Link
      to={`/vfx/item/${item.id}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "block",
        background: "var(--color-card)",
        border: `1px solid ${hover ? "var(--color-accent)" : "var(--color-border)"}`,
        borderRadius: 12,
        padding: 16,
        textDecoration: "none",
        boxShadow: hover ? "0 4px 12px rgba(79,70,229,0.10)" : "0 1px 2px rgba(0,0,0,0.02)",
        transform: hover ? "translateY(-1px)" : "none",
        transition: "all 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <SourceBadge source={item.source} />
          {otherSources.map((s) => <SourceBadge key={s} source={s} />)}
          <PriorityBadge priority={item.priority} />
          {score > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--color-warning)", fontWeight: 600 }}>
              <Star style={{ width: 11, height: 11, fill: "currentColor" }} />
              {score}
            </span>
          )}
        </div>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="원문 열기"
          style={{ color: "var(--color-text-muted)", display: "inline-flex" }}
        >
          <ExternalLink style={{ width: 14, height: 14 }} />
        </a>
      </div>

      <h3 style={{
        fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)",
        marginBottom: 6,
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        overflow: "hidden", lineHeight: 1.4,
      }}>
        {item.title}
      </h3>

      {verdict ? (
        <p style={{
          fontSize: 12, color: "var(--color-accent)", fontStyle: "italic", marginBottom: 8,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          💭 {verdict}
        </p>
      ) : item.abstract ? (
        <p style={{
          fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 8,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          lineHeight: 1.5,
        }}>
          {item.abstract}
        </p>
      ) : null}

      {codeLinks.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          {codeLinks.slice(0, 3).map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={link.description || link.name}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "2px 8px", borderRadius: 6, fontSize: 10,
                background: "var(--color-success-light)", color: "var(--color-success)",
                border: "1px solid #a7f3d0",
                textDecoration: "none",
              }}
            >
              <Github style={{ width: 11, height: 11 }} />
              <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {link.name.split("/")[1] || link.name}
              </span>
              {link.stars > 0 && <span style={{ opacity: 0.7 }}>★{link.stars}</span>}
            </a>
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--color-text-muted)" }}>
        <span>{new Date(item.discovered_at).toLocaleDateString("ko-KR")}</span>
        {item.category_slugs.length > 0 && <span>· {item.category_slugs.join(", ")}</span>}
      </div>
    </Link>
  );
}
