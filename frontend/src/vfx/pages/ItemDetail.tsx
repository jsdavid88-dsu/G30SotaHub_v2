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

function SiblingRow({ item }: { item: Item }) {
  const navigate = useNavigate();
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate(`/item/${item.id}`)}
      onKeyDown={(e) => e.key === "Enter" && navigate(`/item/${item.id}`)}
      className="flex items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-800/50 px-4 py-3 hover:border-brand-500/40 transition cursor-pointer"
    >
      <SourceBadge source={item.source} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-neutral-200 truncate">{item.title}</div>
        <div className="text-[10px] text-neutral-500">{item.external_id}</div>
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
  );
}

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const itemId = id ? Number(id) : undefined;

  const { data: item } = useQuery({
    queryKey: ["item", id],
    queryFn: () => fetchItem(itemId!),
    enabled: !!itemId,
  });

  const { data: siblings = [] } = useQuery({
    queryKey: ["siblings", id],
    queryFn: () => fetchSiblings(itemId!),
    enabled: !!itemId,
  });

  const { data: lineage } = useQuery({
    queryKey: ["lineage", "item", id],
    queryFn: () => fetchItemLineage(itemId!, 2),
    enabled: !!itemId,
  });

  if (!item) return <div className="text-neutral-500">Loading...</div>;
  const score = item.llm_score || item.keyword_score;
  const hasLineage = lineage && lineage.nodes.length > 1;
  const arca = (item.metadata as Record<string, unknown> | undefined)?.arca as
    | ArcaAnalysis
    | undefined;

  return (
    <div className="max-w-5xl space-y-6">
      <Link
        to="/vfx"
        className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-100"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> 대시보드
      </Link>

      <article className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <div className="flex items-center gap-2 mb-3">
          <SourceBadge source={item.source} />
          <PriorityBadge priority={item.priority} />
          {score > 0 && (
            <span className="inline-flex items-center gap-1 text-sm text-amber-400">
              <Star className="h-4 w-4 fill-current" />
              {score}/10
            </span>
          )}
        </div>

        <h1 className="text-xl font-bold mb-3">{item.title}</h1>

        {item.authors && <p className="text-sm text-neutral-400 mb-4">{item.authors}</p>}

        {item.abstract && (
          <div className="text-sm text-neutral-300 leading-relaxed mb-6 whitespace-pre-wrap">
            {item.abstract}
          </div>
        )}

        {item.llm_reason && (
          <div className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-4 mb-4">
            <div className="text-[10px] font-semibold text-brand-400 uppercase mb-1">
              AI 분석
            </div>
            <p className="text-sm text-neutral-200">{item.llm_reason}</p>
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-neutral-800">
          <div className="text-xs text-neutral-500">
            발견: {new Date(item.discovered_at).toLocaleString("ko-KR")}
            {item.published_at && (
              <> · 게시: {new Date(item.published_at).toLocaleDateString("ko-KR")}</>
            )}
          </div>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500"
          >
            원문 보기 <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </article>

      {arca && <ArcaPanel analysis={arca} />}

      {siblings.length > 0 && (
        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h2 className="text-sm font-semibold text-neutral-300 mb-3 flex items-center gap-2">
            <Layers className="h-4 w-4 text-brand-400" />
            같은 연구 ({siblings.length + 1}개 소스)
          </h2>
          <div className="space-y-3">
            {/* Current item first */}
            <div className="flex items-center gap-3 rounded-lg border border-brand-500/30 bg-brand-500/5 px-4 py-3">
              <SourceBadge source={item.source} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-neutral-100 truncate">{item.title}</div>
                <div className="text-[10px] text-neutral-500">{item.external_id}</div>
              </div>
              <span className="text-[10px] text-brand-400 whitespace-nowrap">현재 보는 중</span>
            </div>
            {/* Siblings: arxiv → github → hf order (already sorted by backend) */}
            {siblings.map((sib) => (
              <SiblingRow key={sib.id} item={sib} />
            ))}
          </div>
        </section>
      )}

      {item.category_slugs.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold text-neutral-500 uppercase mb-2">
            카테고리
          </div>
          <div className="flex flex-wrap gap-2">
            {item.category_slugs.map((slug) => (
              <Link
                key={slug}
                to={`/category/${slug}`}
                className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:border-brand-500/50"
              >
                {slug}
              </Link>
            ))}
          </div>
        </div>
      )}

      {hasLineage && (
        <section>
          <h2 className="text-sm font-semibold text-neutral-300 mb-3">기술 계보 (주변)</h2>
          <LineageFlow graph={lineage} height={500} />
        </section>
      )}

      <CommentSection itemId={item.id} />
    </div>
  );
}
