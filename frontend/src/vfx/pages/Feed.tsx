import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Flame, RefreshCw, Bookmark, Globe, Youtube, Twitter, Sparkles, FileText } from "lucide-react";
import { fetchFeed, triggerFeedCrawl } from "../api/feed";
import FeedCard from "../components/FeedCard";
import ResearchFeed from "./ResearchFeed";
import { pageHeadingStyle, pageSubtitleStyle, cardStyle, btnPrimary } from "../design";

type Tab = "all" | "youtube" | "x" | "hf_paper" | "hf_space" | "paperswithcode" | "crawl4ai" | "reddit" | "saved";
type FeedMode = "collect" | "research";

export default function Feed() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialMode: FeedMode = searchParams.get("mode") === "research" ? "research" : "collect";
  const [mode, setMode] = useState<FeedMode>(initialMode);

  const setModeAndUrl = (m: FeedMode) => {
    setMode(m);
    setSearchParams(m === "research" ? { mode: "research" } : {}, { replace: true });
  };

  const modeToggle = (
    <div style={{ display: "inline-flex", gap: 4, background: "var(--color-surface, #fff)", border: "1px solid var(--color-border, #e2e8f0)", borderRadius: 10, padding: 4, marginBottom: 20 }}>
      {([["collect", "🛰 수집"], ["research", "🔬 연구"]] as const).map(([m, label]) => (
        <button key={m} onClick={() => setModeAndUrl(m)}
          style={{
            padding: "6px 16px", borderRadius: 7, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer",
            background: mode === m ? "var(--color-accent, #4f46e5)" : "transparent",
            color: mode === m ? "#fff" : "var(--color-text-muted, #64748b)",
          }}>
          {label}
        </button>
      ))}
    </div>
  );

  if (mode === "research") {
    return (
      <div style={{ width: "100%" }}>
        <h1 style={{ ...pageHeadingStyle, display: "flex", alignItems: "center", gap: 10 }}>VFX 피드</h1>
        <p style={pageSubtitleStyle}>🛰 수집(Arca 발견) / 🔬 연구(우리 랩 활동)를 한 곳에서.</p>
        {modeToggle}
        <ResearchFeed embedded />
      </div>
    );
  }
  return <CollectFeed modeToggle={modeToggle} />;
}

function CollectFeed({ modeToggle }: { modeToggle: React.ReactNode }) {
  const [tab, setTab] = useState<Tab>("all");
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const qc = useQueryClient();

  const filters = (() => {
    if (tab === "saved") return { saved: true, limit: 100 };
    if (tab === "all") return { limit: 100 };
    return { source: tab, limit: 100 };
  })();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["feed", tab],
    queryFn: () => fetchFeed(filters),
  });

  const crawlMutation = useMutation({
    mutationFn: () => triggerFeedCrawl(),
    onSuccess: () => {
      setRefreshMsg("수집 시작됨 — 1-2분 후 새로고침");
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["feed"] });
        setRefreshMsg(null);
      }, 5000);
    },
    onError: (e) => {
      setRefreshMsg(`에러: ${e instanceof Error ? e.message : String(e)}`);
      setTimeout(() => setRefreshMsg(null), 5000);
    },
  });

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "all", label: "전체", icon: Flame },
    { id: "youtube", label: "YouTube", icon: Youtube },
    { id: "x", label: "X", icon: Twitter },
    { id: "hf_paper", label: "HF 논문", icon: Sparkles },
    { id: "hf_space", label: "HF 스페이스", icon: Sparkles },
    { id: "paperswithcode", label: "PwC", icon: FileText },
    { id: "crawl4ai", label: "웹", icon: Globe },
    { id: "reddit", label: "Reddit", icon: Flame },
    { id: "saved", label: "북마크", icon: Bookmark },
  ];

  return (
    <div style={{ width: "100%" }}>
      <div style={{ marginBottom: 12, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ ...pageHeadingStyle, display: "flex", alignItems: "center", gap: 10 }}>
            <Flame style={{ width: 26, height: 26, color: "var(--color-warning)" }} />
            VFX 피드
          </h1>
          <p style={pageSubtitleStyle}>🛰 수집(Arca 발견) / 🔬 연구(우리 랩 활동)를 한 곳에서.</p>
        </div>
        <button
          onClick={() => crawlMutation.mutate()}
          disabled={crawlMutation.isPending}
          style={{ ...btnPrimary, opacity: crawlMutation.isPending ? 0.5 : 1 }}
        >
          <RefreshCw style={{ width: 14, height: 14, animation: crawlMutation.isPending ? "spin 1s linear infinite" : "none" }} />
          지금 수집
        </button>
      </div>

      {modeToggle}

      {refreshMsg && (
        <div style={{
          padding: "10px 16px", borderRadius: 10, marginBottom: 20,
          background: "var(--color-accent-light)", color: "var(--color-accent-dark)",
          fontSize: 13, fontWeight: 500,
        }}>
          {refreshMsg}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid var(--color-border)", marginBottom: 20, paddingBottom: 1, overflowX: "auto" }}>
        {tabs.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: "8px 8px 0 0",
                fontSize: 13, fontWeight: 500,
                background: active ? "var(--color-accent-light)" : "transparent",
                color: active ? "var(--color-accent-dark)" : "var(--color-text-muted)",
                border: "none",
                borderBottom: active ? "2px solid var(--color-accent)" : "2px solid transparent",
                marginBottom: -1,
                cursor: "pointer", whiteSpace: "nowrap",
                transition: "all 0.15s",
              }}
            >
              <Icon style={{ width: 14, height: 14 }} />
              {label}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div style={{ ...cardStyle, padding: 48, textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "var(--color-text-muted)" }}>로딩 중...</p>
        </div>
      ) : items.length === 0 ? (
        <div style={{ ...cardStyle, padding: 48, textAlign: "center" }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-secondary)" }}>
            {tab === "saved" ? "북마크한 항목이 없습니다" : "수집된 피드가 없습니다"}
          </p>
          {tab !== "saved" && (
            <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 8, lineHeight: 1.6 }}>
              우측 상단 [지금 수집] 클릭. <br />
              Crawl4AI 가 미설치면 Reddit 만 수집됩니다.
            </p>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {items.map((item) => <FeedCard key={item.id} item={item} />)}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
