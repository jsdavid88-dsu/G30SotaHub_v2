// VFX SOTA Monitor — Hub App.tsx 의 /vfx/* nested route 안에서 mount.
// Paths 는 모두 상대경로 (앞 슬래시 X) → 부모 /vfx 와 자동 합쳐짐.
// QueryClientProvider 는 main.tsx 최상위에 통합.
//
// #17: 페이지별 React.lazy — reactflow(LineageFlow) 를 쓰는 graph/item 페이지가
// 진입 시에만 로드되도록 분리. Layout 은 항상 필요하니 static.
import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "./components/layout/Layout";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const CategoryDetail = lazy(() => import("./pages/CategoryDetail"));
const ItemDetail = lazy(() => import("./pages/ItemDetail"));
const Timeline = lazy(() => import("./pages/Timeline"));
const LineageGraph = lazy(() => import("./pages/LineageGraph"));
const SearchResults = lazy(() => import("./pages/SearchResults"));
const Feed = lazy(() => import("./pages/Feed"));
const Submit = lazy(() => import("./pages/Submit"));
const Triage = lazy(() => import("./pages/Triage"));

function PageFallback() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
      <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>로딩 중...</p>
    </div>
  );
}

export default function VfxApp() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Suspense fallback={<PageFallback />}><Dashboard /></Suspense>} />
        <Route path="category/:slug" element={<Suspense fallback={<PageFallback />}><CategoryDetail /></Suspense>} />
        <Route path="item/:id" element={<Suspense fallback={<PageFallback />}><ItemDetail /></Suspense>} />
        <Route path="timeline" element={<Suspense fallback={<PageFallback />}><Timeline /></Suspense>} />
        <Route path="graph" element={<Suspense fallback={<PageFallback />}><LineageGraph /></Suspense>} />
        <Route path="feed" element={<Suspense fallback={<PageFallback />}><Feed /></Suspense>} />
        <Route path="submit" element={<Suspense fallback={<PageFallback />}><Submit /></Suspense>} />
        <Route path="triage" element={<Suspense fallback={<PageFallback />}><Triage /></Suspense>} />
        <Route path="search" element={<Suspense fallback={<PageFallback />}><SearchResults /></Suspense>} />
      </Route>
    </Routes>
  );
}
