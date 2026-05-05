import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Flame, RefreshCw, Bookmark, Globe, Youtube, Twitter, Sparkles, FileText } from "lucide-react";
import { fetchFeed, triggerFeedCrawl } from "../api/feed";
import FeedCard from "../components/FeedCard";

type Tab = "all" | "youtube" | "x" | "hf_paper" | "hf_space" | "paperswithcode" | "crawl4ai" | "reddit" | "saved";

export default function Feed() {
  const [tab, setTab] = useState<Tab>("all");
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const queryClient = useQueryClient();

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
        queryClient.invalidateQueries({ queryKey: ["feed"] });
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
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Flame className="h-6 w-6 text-orange-400" />
            실전 피드
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            뉴스, 워크플로우, 튜토리얼, 커뮤니티 논의 · 6시간마다 자동 수집
          </p>
        </div>

        <button
          onClick={() => crawlMutation.mutate()}
          disabled={crawlMutation.isPending}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${crawlMutation.isPending ? "animate-spin" : ""}`} />
          지금 수집
        </button>
      </div>

      {refreshMsg && (
        <div className="rounded-lg border border-brand-500/30 bg-brand-500/10 px-4 py-2 text-xs text-brand-200">
          {refreshMsg}
        </div>
      )}

      <div className="flex items-center gap-2 border-b border-neutral-800 pb-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition ${
              tab === id
                ? "bg-brand-600/20 text-brand-300"
                : "text-neutral-400 hover:bg-neutral-800"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-dashed border-neutral-800 p-12 text-center text-sm text-neutral-500">
          로딩 중...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-800 p-12 text-center space-y-2">
          <p className="text-sm text-neutral-400">
            {tab === "saved" ? "북마크한 항목이 없습니다" : "수집된 피드가 없습니다"}
          </p>
          {tab !== "saved" && (
            <p className="text-xs text-neutral-600">
              우측 상단 "지금 수집" 버튼을 눌러 시작하세요.
              <br />
              Crawl4AI가 설치되지 않으면 Reddit만 수집됩니다.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((item) => (
            <FeedCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
