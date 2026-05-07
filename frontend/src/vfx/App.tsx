// VFX SOTA Monitor — Hub App.tsx 의 /vfx/* nested route 안에서 mount.
// Paths 는 모두 상대경로 (앞 슬래시 X) → 부모 /vfx 와 자동 합쳐짐.
// QueryClientProvider 는 main.tsx 최상위에 통합.
import { Routes, Route } from "react-router-dom";
import Layout from "./components/layout/Layout";
import Dashboard from "./pages/Dashboard";
import CategoryDetail from "./pages/CategoryDetail";
import ItemDetail from "./pages/ItemDetail";
import Timeline from "./pages/Timeline";
import LineageGraph from "./pages/LineageGraph";
import SearchResults from "./pages/SearchResults";
import Feed from "./pages/Feed";
import Submit from "./pages/Submit";
import Triage from "./pages/Triage";

export default function VfxApp() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="category/:slug" element={<CategoryDetail />} />
        <Route path="item/:id" element={<ItemDetail />} />
        <Route path="timeline" element={<Timeline />} />
        <Route path="graph" element={<LineageGraph />} />
        <Route path="feed" element={<Feed />} />
        <Route path="submit" element={<Submit />} />
        <Route path="triage" element={<Triage />} />
        <Route path="search" element={<SearchResults />} />
      </Route>
    </Routes>
  );
}
