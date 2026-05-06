// VFX Layout — Hub Layout 의 main 영역(padding 있음) 안에 nested 됨.
// - Hub Header 가 위에 있으니까 자체 Header 제거
// - 자체 Sidebar 만 남김 (Hub Sidebar + VFX Sidebar = 양쪽 사이드바)
// - h-full + rounded-lg + overflow-hidden : Hub main padding 안에 둥근 박스로 깔끔하게
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function Layout() {
  return (
    <div className="flex h-full bg-neutral-950 text-neutral-100 rounded-xl overflow-hidden border border-neutral-800">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
