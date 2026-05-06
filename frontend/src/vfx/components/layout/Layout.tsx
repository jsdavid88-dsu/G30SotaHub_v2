// VFX Layout — Hub Layout 의 main 영역 안에 nested.
// - Hub 사이드바에 VFX 메뉴들이 이미 있어서 자체 Sidebar 제거 (중복 제거)
// - Hub Header 도 위에 있어서 자체 Header 도 없음
// - 둥근 dark 박스로 시각 분리만
import { Outlet } from "react-router-dom";

export default function Layout() {
  return (
    <div className="h-full bg-neutral-950 text-neutral-100 rounded-xl overflow-hidden border border-neutral-800">
      <main className="h-full overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
