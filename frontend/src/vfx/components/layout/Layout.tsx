// VFX Layout — Hub Layout 의 main 영역 안에 nested.
// - Hub 사이드바에 VFX 메뉴들이 다 있어 자체 Sidebar 제거 (중복)
// - dark 박스 height: 콘텐츠 만큼만. h-full 로 화면 가득 채우면 빈 검정 공간이 거대해 보임
// - 콘텐츠 작을 때도 최소 높이 보장 (min-h-[60vh])
import { Outlet } from "react-router-dom";

export default function Layout() {
  return (
    <div className="bg-neutral-950 text-neutral-100 rounded-xl overflow-hidden border border-neutral-800 min-h-[60vh]">
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
