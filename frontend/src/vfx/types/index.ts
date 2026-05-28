// VFX 공통 타입 정의 (vfx-sota-monitor 흡수 + Phase 1 통합 필드).
// 통합 모델 SotaItem(=Item) 응답 형식.

export type Category = {
  id: number;
  slug: string;
  name_ko: string;
  name_en: string;
  description: string | null;
  icon: string | null;
  keywords: string[];
  github_topics: string[];
  hf_tags: string[];
  subreddits: string[];
  x_accounts: string[];
  current_sota: string[];
  display_order: number;
  item_count: number;
  new_this_week: number;
};

// SotaAssignment / SotaReview — Hub 학생 배정 시스템 (통합 후 자동 수집된 모델도 배정 가능)
export type SotaReview = {
  id: string;
  reviewer_id: string;
  reviewer_name: string;
  content: string;
  submitted_at: string | null;
  created_at: string;
};

export type SotaAssignment = {
  id: string;
  sota_item_id: number;
  assignee_id: string;
  assignee_name: string;
  assigned_by: string | null;
  status:
    | "recommended"
    | "assigned"
    | "in_review"
    | "submitted"
    | "approved"
    | "rejected";
  due_date: string | null;
  created_at: string;
  reviews: SotaReview[];
};

export type Item = {
  id: number;
  // Phase 1 통합: 'manual' (Hub 수동 등록) 추가
  source: "arxiv" | "github" | "huggingface" | "reddit" | "x" | "manual" | string;
  external_id: string;
  // manual item 은 URL 없을 수 있음 (이슈 #15 P1-3)
  url: string | null;
  title: string;
  abstract: string | null;
  authors: string | null;
  published_at: string | null;
  discovered_at: string;
  metadata: Record<string, unknown>;
  keyword_score: number;
  llm_score: number;
  llm_reason: string | null;
  priority: "P0" | "P1" | "P2" | "P3" | "WATCH" | null;
  status: string;
  category_slugs: string[];
  group_id: number | null;

  // === Phase 1 통합 신규 필드 (마스터 설계서 §5) ===
  description?: string | null;
  wiki_body?: string | null;
  refs?: Record<string, string | null>;
  confidence_status?: "verified" | "stale" | "contradicted" | "unverified" | null;
  version?: number;
  lifecycle_status?: "research" | "dev" | "testing" | "production" | "deprecated";
  replaced_by_id?: number | null;
  deprecated_at?: string | null;
  deprecated_reason?: string | null;
  project_id?: string | null;

  // === Hub 학생 배정 (있으면 표시, 없으면 빈 배열) ===
  assignments?: SotaAssignment[];
};

export type DashboardSummary = {
  total_items: number;
  new_this_week: number;
  p0_count: number;
  p1_count: number;
  categories_with_updates: number;
  last_crawl: string | null;
};

export type FeedItem = {
  id: number;
  source:
    | "youtube"
    | "x"
    | "hf_paper"
    | "hf_space"
    | "paperswithcode"
    | "crawl4ai"
    | "reddit"
    | "firecrawl"
    | "manual"
    | string;
  external_id: string;
  url: string;
  title: string;
  excerpt: string | null;
  content_md: string | null;
  image_url: string | null;
  author: string | null;
  published_at: string | null;
  discovered_at: string;
  tags: string[];
  feed_metadata: Record<string, unknown>;
  is_saved: boolean;
  saved_at: string | null;
  promoted_item_id: number | null;
};
