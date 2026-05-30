import { useState, type ReactNode } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ExternalLink, Star, Layers, Github, Users, CheckCircle2, BookOpen, Sparkles, Loader2 } from "lucide-react";
import { fetchItem, fetchSiblings, generateWiki } from "../api/items";
import { fetchItemLineage } from "../api/lineage";
import { useRole } from "../../contexts/RoleContext";
import type { Item } from "../types";
import SourceBadge from "../components/SourceBadge";
import PriorityBadge from "../components/PriorityBadge";
import LineageFlow from "../components/LineageFlow";
import CommentSection from "../components/CommentSection";
import ArcaPanel, { type ArcaAnalysis } from "../components/ArcaPanel";
import TriageActions from "../components/TriageActions";
import AssignModal, { type AssignModalState } from "../components/AssignModal";
import { cardStyle, sectionHeaderStyle, sectionTitleStyle, btnPrimary, btnGhost } from "../design";

const LIFECYCLE_INFO: Record<string, { bg: string; color: string; label: string; desc: string }> = {
  research:   { bg: "#f1f5f9", color: "#475569", label: "연구",   desc: "검토·분석 단계" },
  dev:        { bg: "#dbeafe", color: "#1d4ed8", label: "개발",   desc: "실제 적용·구현 진행" },
  testing:    { bg: "#fef3c7", color: "#b45309", label: "테스트", desc: "프로덕션 검증" },
  production: { bg: "#d1fae5", color: "#047857", label: "운영",   desc: "실 사용 중" },
  deprecated: { bg: "#fee2e2", color: "#dc2626", label: "폐기",   desc: "더 이상 사용 안 함" },
};

const WORKFLOW_INFO: Record<string, { bg: string; color: string; label: string }> = {
  new:      { bg: "#e0e7ff", color: "#4338ca", label: "새로 발견 (분류 대기)" },
  triaged:  { bg: "#dbeafe", color: "#1d4ed8", label: "분류 완료 / 진행 중" },
  holding:  { bg: "#fef3c7", color: "#b45309", label: "보류" },
  skipped:  { bg: "#f1f5f9", color: "#64748b", label: "스킵" },
  archived: { bg: "#f9fafb", color: "#6b7280", label: "아카이브" },
};

const ASSIGN_STATUS_COLOR: Record<string, { bg: string; color: string; label: string }> = {
  recommended: { bg: "#f0fdf4", color: "#15803d", label: "추천" },
  assigned:    { bg: "#e0e7ff", color: "#4338ca", label: "배정됨" },
  in_review:   { bg: "#fef3c7", color: "#b45309", label: "리뷰중" },
  submitted:   { bg: "#dbeafe", color: "#1d4ed8", label: "제출완료" },
  approved:    { bg: "#d1fae5", color: "#047857", label: "승인" },
  rejected:    { bg: "#fee2e2", color: "#dc2626", label: "반려" },
};

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
      ) : item.url ? (
        <a href={item.url} target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{ color: "var(--color-text-muted)", display: "inline-flex" }}>
          <ExternalLink style={{ width: 14, height: 14 }} />
        </a>
      ) : null}
    </div>
  );
}

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const itemId = id ? Number(id) : undefined;
  const qc = useQueryClient();
  const { currentRole } = useRole();
  const canEditWiki = currentRole === "admin" || currentRole === "professor";
  const [assignModal, setAssignModal] = useState<AssignModalState>(null);
  const [genWiki, setGenWiki] = useState(false);

  const { data: item, refetch } = useQuery({
    queryKey: ["item", id], queryFn: () => fetchItem(itemId!), enabled: !!itemId,
  });
  const { data: siblings = [] } = useQuery({
    queryKey: ["siblings", id], queryFn: () => fetchSiblings(itemId!), enabled: !!itemId,
  });
  const { data: lineage } = useQuery({
    queryKey: ["lineage", "item", id], queryFn: () => fetchItemLineage(itemId!, 2), enabled: !!itemId,
  });

  const refreshAll = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["items"] });
  };

  const handleGenWiki = async () => {
    if (!itemId || genWiki) return;
    setGenWiki(true);
    try {
      await generateWiki(itemId);
      refetch();
    } catch (e) {
      alert(`Arca wiki 생성 실패: ${e instanceof Error ? e.message : String(e)}\n(Ollama/Gemma 연결 확인)`);
    } finally {
      setGenWiki(false);
    }
  };

  if (!item) return <div style={{ color: "var(--color-text-muted)" }}>Loading...</div>;

  const score = item.llm_score || item.keyword_score;
  const hasLineage = lineage && lineage.nodes.length > 1;
  const arca = (item.metadata as Record<string, unknown> | undefined)?.arca as ArcaAnalysis | undefined;
  const assignments = item.assignments ?? [];
  const lifecycleInfo = item.lifecycle_status ? LIFECYCLE_INFO[item.lifecycle_status] : null;
  const workflowInfo = item.status ? WORKFLOW_INFO[item.status] : null;
  const refs = item.refs ?? {};
  const refEntries = Object.entries(refs).filter(([, v]) => Boolean(v));

  return (
    <div style={{ width: "100%", maxWidth: 960 }}>
      <Link to="/vfx" style={{ ...btnGhost, marginBottom: 16 }}>
        <ChevronLeft style={{ width: 14, height: 14 }} /> 대시보드
      </Link>

      <article style={{ ...cardStyle, padding: 28, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <SourceBadge source={item.source} />
          <PriorityBadge priority={item.priority} />
          {lifecycleInfo && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
              background: lifecycleInfo.bg, color: lifecycleInfo.color,
            }} title={lifecycleInfo.desc}>
              {lifecycleInfo.label}
            </span>
          )}
          {workflowInfo && (
            <span style={{
              padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
              background: workflowInfo.bg, color: workflowInfo.color,
            }}>
              {workflowInfo.label}
            </span>
          )}
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

        {/* refs (외부 출처 통합 표시) */}
        {refEntries.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {refEntries.map(([k, v]) => (
              <a
                key={k}
                href={v as string}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 500,
                  background: "#eff6ff", color: "#1d4ed8",
                  border: "1px solid #dbeafe",
                  textDecoration: "none",
                  transition: "all 0.12s",
                }}
              >
                {k === "github" && <Github style={{ width: 12, height: 12 }} />}
                {k}
              </a>
            ))}
          </div>
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
            {item.published_at && <><strong style={{ color: "var(--color-text-secondary)" }}>발표</strong> {new Date(item.published_at).toLocaleDateString("ko-KR")} · </>}
            <span style={{ opacity: 0.7 }}>발견 {new Date(item.discovered_at).toLocaleString("ko-KR")}</span>
          </div>
          {item.url ? (
            <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ ...btnPrimary, textDecoration: "none" }}>
              원문 보기 <ExternalLink style={{ width: 12, height: 12 }} />
            </a>
          ) : (
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>URL 없음 (수동 등록)</span>
          )}
        </div>
      </article>

      {/* === 현황 & 액션 === */}
      <section style={{ ...cardStyle, marginBottom: 24, overflow: "hidden" }}>
        <div style={sectionHeaderStyle}>
          <div style={{ ...sectionTitleStyle, display: "flex", alignItems: "center", gap: 8 }}>
            <Users style={{ width: 16, height: 16, color: "var(--color-accent)" }} />
            현황 & 액션
          </div>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* 액션 버튼 */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              액션
            </p>
            <TriageActions
              item={item}
              onDone={refreshAll}
              onRequestAssign={(itemId, mode) => setAssignModal({ itemId, mode })}
              size="md"
            />
          </div>

          {/* 배정 현황 */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              배정 / 검토 현황 ({assignments.length})
            </p>
            {assignments.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--color-text-muted)", padding: "12px 16px", background: "#f8fafc", borderRadius: 10 }}>
                배정된 사용자가 없습니다. 위의 [배정] 또는 [모터헤드] 버튼으로 학생/외부 협력자에게 검토를 맡길 수 있습니다.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {assignments.map((a) => {
                  const statusInfo = ASSIGN_STATUS_COLOR[a.status] ?? { bg: "#f1f5f9", color: "#64748b", label: a.status };
                  return (
                    <div key={a.id} style={{
                      padding: "12px 16px", borderRadius: 10,
                      background: "#f8fafc", border: "1px solid #f1f5f9",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: a.reviews.length > 0 ? 8 : 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: "50%",
                            background: "linear-gradient(135deg, #4f46e5, #3730a3)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            color: "#fff", fontSize: 11, fontWeight: 700,
                          }}>
                            {(a.assignee_name || "?").charAt(0)}
                          </div>
                          <div>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
                              {a.assignee_name || "—"}
                            </span>
                            {a.due_date && (
                              <span style={{ fontSize: 11, color: "var(--color-text-muted)", marginLeft: 8 }}>
                                마감 {new Date(a.due_date).toLocaleDateString("ko-KR")}
                              </span>
                            )}
                          </div>
                        </div>
                        <span style={{
                          padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                          background: statusInfo.bg, color: statusInfo.color,
                        }}>
                          {statusInfo.label}
                        </span>
                      </div>
                      {a.reviews.length > 0 && (
                        <div style={{ paddingTop: 8, borderTop: "1px solid #e2e8f0", marginTop: 4 }}>
                          <p style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                            리뷰 ({a.reviews.length})
                          </p>
                          {a.reviews.slice(0, 2).map((r) => (
                            <div key={r.id} style={{
                              padding: "8px 12px", borderRadius: 6,
                              background: "#fff", border: "1px solid #f1f5f9",
                              marginBottom: 4,
                            }}>
                              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                                {r.content}
                              </p>
                              <p style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 4 }}>
                                {r.reviewer_name}{r.submitted_at && <> · {new Date(r.submitted_at).toLocaleString("ko-KR")}</>}
                              </p>
                            </div>
                          ))}
                          {a.reviews.length > 2 && (
                            <p style={{ fontSize: 10, color: "var(--color-text-muted)" }}>+{a.reviews.length - 2}건 더</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 라이프사이클 시각화 */}
          {lifecycleInfo && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                라이프사이클
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                {(["research", "dev", "testing", "production", "deprecated"] as const).map((stage, i) => {
                  const info = LIFECYCLE_INFO[stage];
                  const isCurrent = item.lifecycle_status === stage;
                  const isPast = ["research", "dev", "testing", "production", "deprecated"].indexOf(item.lifecycle_status || "research") > i;
                  return (
                    <span key={stage} style={{
                      padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: isCurrent ? info.bg : (isPast ? "#e2e8f0" : "transparent"),
                      color: isCurrent ? info.color : (isPast ? "#94a3b8" : "#cbd5e1"),
                      border: isCurrent ? "none" : "1px dashed #e2e8f0",
                    }}>
                      {isCurrent && <CheckCircle2 style={{ width: 11, height: 11, display: "inline", verticalAlign: "middle", marginRight: 3 }} />}
                      {info.label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {arca && <div style={{ marginBottom: 24 }}><ArcaPanel analysis={arca} /></div>}

      <WikiSection
        body={item.wiki_body}
        canEdit={canEditWiki}
        generating={genWiki}
        onGenerate={handleGenWiki}
      />

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

      <AssignModal
        state={assignModal}
        onClose={() => setAssignModal(null)}
        onDone={refreshAll}
      />
    </div>
  );
}

// ── Wiki 섹션 (Karpathy 온톨로지 wiki tier) ──────────────────────
// 간단 Markdown 렌더: ## 헤더 / - 리스트 / [[wikilink]] → 검색 점프
function renderWikiBody(body: string) {
  const parseLinks = (text: string, kb: string) => {
    const out: ReactNode[] = [];
    const re = /\[\[([^\]]+)\]\]/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let k = 0;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out.push(text.slice(last, m.index));
      const term = m[1].trim();
      out.push(
        <Link key={`${kb}-${k++}`} to={`/vfx/search?q=${encodeURIComponent(term)}`}
          style={{ color: "var(--color-accent)", fontWeight: 600, textDecoration: "none" }}>
          {term}
        </Link>
      );
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  };
  return body.split("\n").map((line, i) => {
    const key = `w${i}`;
    if (line.startsWith("## ")) return <h4 key={key} style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", margin: "14px 0 6px" }}>{line.slice(3)}</h4>;
    if (line.startsWith("# ")) return <h3 key={key} style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)", margin: "16px 0 8px" }}>{line.slice(2)}</h3>;
    if (line.trim().startsWith("- ")) return <li key={key} style={{ fontSize: 13, color: "var(--color-text-secondary)", marginLeft: 18, lineHeight: 1.7 }}>{parseLinks(line.trim().slice(2), key)}</li>;
    if (!line.trim()) return <div key={key} style={{ height: 6 }} />;
    return <p key={key} style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.7, margin: "2px 0" }}>{parseLinks(line, key)}</p>;
  });
}

function WikiSection({ body, canEdit, generating, onGenerate }: {
  body?: string | null;
  canEdit: boolean;
  generating: boolean;
  onGenerate: () => void;
}) {
  return (
    <section style={{ ...cardStyle, marginBottom: 24, overflow: "hidden" }}>
      <div style={{ ...sectionHeaderStyle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ ...sectionTitleStyle, display: "flex", alignItems: "center", gap: 8 }}>
          <BookOpen style={{ width: 16, height: 16, color: "var(--color-accent)" }} />
          Wiki <span style={{ fontSize: 12, fontWeight: 400, color: "var(--color-text-muted)" }}>아르카 정리</span>
        </div>
        {canEdit && (
          <button onClick={onGenerate} disabled={generating}
            style={{ ...btnPrimary, opacity: generating ? 0.6 : 1, cursor: generating ? "not-allowed" : "pointer" }}>
            {generating
              ? <Loader2 style={{ width: 13, height: 13, animation: "spin 0.8s linear infinite" }} />
              : <Sparkles style={{ width: 13, height: 13 }} />}
            {body ? "재생성" : "Arca 초안 생성"}
          </button>
        )}
      </div>
      <div style={{ padding: 20 }}>
        {body
          ? <div>{renderWikiBody(body)}</div>
          : <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
              아직 wiki 가 없습니다.{canEdit ? " 위 버튼으로 Arca 초안을 생성하세요." : ""}
            </p>}
      </div>
    </section>
  );
}
