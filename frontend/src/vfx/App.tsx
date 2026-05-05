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

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/category/:slug" element={<CategoryDetail />} />
        <Route path="/item/:id" element={<ItemDetail />} />
        <Route path="/timeline" element={<Timeline />} />
        <Route path="/graph" element={<LineageGraph />} />
        <Route path="/feed" element={<Feed />} />
        <Route path="/submit" element={<Submit />} />
        <Route path="/search" element={<SearchResults />} />
      </Route>
    </Routes>
  );
}

export default App;
