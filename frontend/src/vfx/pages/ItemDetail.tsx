import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ExternalLink, Star, Layers } from "lucide-react";
import { fetchItem, fetchSiblings } from "../api/items";
import { fetchItemLineage } from "../api/lineage";
import type { Item } from "../types";
import SourceBadge from "../components/SourceBadge";
import PriorityBadge from "../components/PriorityBadge";
import LineageFlow from "../components/LineageFlow";
import CommentSection from "../components/CommentSection";
import ArcaPanel, { type ArcaAnalysis } from "../components/ArcaPanel";
import { cardStyle, sectionHeaderStyle, sectionTitleStyle, btnPrimary, btnGhost } from "../design";

function SiblingRow({ item, current = false }: { item: Item; current?: boolean }) {
  const navigate = useNavigate();
  const [hover, setHover] = useState(false);
  return (
    <div
      role={current ? undefined : "link"}
      tabIndex={current ? -1 : 0}
      onClick={() => !current && navigate(`/vfx/item/${item.id}`)}
      onKeyDown={(e) => !current && e.key === "Enter" && navigate(`/vfx/item/${item.id}`)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 16px", borderRadius: 12,
        background: current ? "var(--color-accent-light)" : (hover ? "#f8fafc" : "var(--color-card)"),
        border: `1px solid ${current ? "var(--color-accent)" : "var(--color-border)"}`,
        cursor: current ? "default" : "pointer",
        transition: "all 0.15s",
      }}
    >
      <SourceBadge source={item.source} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {item.title}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{item.external_id}</div>
      </div>
      {current ? (
        <span style={{ fontSize: 11, color: "var(--color-accent-dark)", fontWeight: 600, whiteSpace: "nowrap" }}>현재 보는 중</span>
      ) : (
        <a href={item.url} target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{ color: "var(--color-text-muted)", display: "inline-flex" }}>
          <ExternalLink style={{ width: 14, height: 14 }} />
        </a>
      )}
    </div>
  );
}

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const itemId = id ? Number(id) : undefined;

  const { data: item } = useQuery({
    queryKey: ["item", id], queryFn: () => fetchItem(itemId!), enabled: !!itemId,
  });
  const { data: siblings = [] } = useQuery({
    queryKey: ["siblings", id], queryFn: () => fetchSiblings(itemId!), enabled: !!itemId,
  });
  const { data: lineage } = useQuery({
    queryKey: ["lineage", "item", id], queryFn: () => fetchItemLineage(itemId!, 2), enabled: !!itemId,
  });

  if (!item) return <div style={{ color: "var(--color-text-muted)" }}>Loading...</div>;

  const score = item.llm_score || item.keyword_score;
  const hasLineage = lineage && lineage.nodes.length > 1;
  const arca = (item.metadata as Record<string, unknown> | undefined)?.arca as ArcaAnalysis | undefined;

  return (
    <div style={{ width: "100%", maxWidth: 960 }}>
      <Link to="/vfx" style={{ ...btnGhost, marginBottom: 16 }}>
        <ChevronLeft style={{ width: 14, height: 14 }} /> 대시보드
      </Link>

      <article style={{ ...cardStyle, padding: 28, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <SourceBadge source={item.source} />
          <PriorityBadge priority={item.priority} />
          {score > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 14, color: "var(--color-warning)", fontWeight: 600 }}>
              <Star style={{ width: 16, height: 16, fill: "currentColor" }} />
              {score}/10
            </span>
          )}
        </div>

        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 12, lineHeight: 1.3 }}>
          {item.title}
        </h1>

        {item.authors && (
          <p style={{ fontSize: 14, color: "var(--color-text-muted)", marginBottom: 16 }}>{item.authors}</p>
        )}

        {item.abstract && (
          <div style={{
            fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.7,
            marginBottom: 20, whiteSpace: "pre-wrap",
          }}>
            {item.abstract}
          </div>
        )}

        {item.llm_reason && (
          <div style={{
            padding: 16, borderRadius: 12, marginBottom: 16,
            background: "var(--color-accent-light)",
            border: "1px solid #c7d2fe",
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: "var(--color-accent)",
              textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6,
            }}>AI 분석</div>
            <p style={{ fontSize: 14, color: "var(--color-text-primary)", lineHeight: 1.6 }}>{item.llm_reason}</p>
          </div>
        )}

        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          paddingTop: 16, borderTop: "1px solid #f1f5f9", flexWrap: "wrap", gap: 12,
        }}>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            발견: {new Date(item.discovered_at).toLocaleString("ko-KR")}
            {item.published_at && <> · 게시: {new Date(item.published_at).toLocaleDateString("ko-KR")}</>}
          </div>
          <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ ...btnPrimary, textDecoration: "none" }}>
            원문 보기 <ExternalLink style={{ width: 12, height: 12 }} />
          </a>
        </div>
      </article>

      {arca && <div style={{ marginBottom: 24 }}><ArcaPanel analysis={arca} /></div>}

      {siblings.length > 0 && (
        <section style={{ ...cardStyle, marginBottom: 24, overflow: "hidden" }}>
          <div style={sectionHeaderStyle}>
            <div style={{ ...sectionTitleStyle, display: "flex", alignItems: "center", gap: 8 }}>
              <Layers style={{ width: 16, height: 16, color: "var(--color-accent)" }} />
              같은 연구 ({siblings.length + 1}개 소스)
            </div>
          </div>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
            <SiblingRow item={item} current />
            {siblings.map((sib) => <SiblingRow key={sib.id} item={sib} />)}
          </div>
        </section>
      )}

      {item.category_slugs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: "var(--color-text-muted)",
            textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10,
          }}>카테고리</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {item.category_slugs.map((slug) => (
              <Link key={slug} to={`/vfx/category/${slug}`}
                style={{
                  padding: "6px 12px", borderRadius: 8, fontSize: 13,
                  background: "#fff", border: "1px solid var(--color-border)",
                  color: "var(--color-text-secondary)", textDecoration: "none",
                  transition: "all 0.15s",
                }}>
                {slug}
              </Link>
            ))}
          </div>
        </div>
      )}

      {hasLineage && (
        <section style={{ ...cardStyle, marginBottom: 24, overflow: "hidden" }}>
          <div style={sectionHeaderStyle}>
            <div style={sectionTitleStyle}>기술 계보 (주변)</div>
          </div>
          <div style={{ padding: 16 }}>
            <LineageFlow graph={lineage} height={500} />
          </div>
        </section>
      )}

      <CommentSection itemId={item.id} />
    </div>
  );
}
