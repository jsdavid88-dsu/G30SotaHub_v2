// VFX Layout — Hub light 테마와 통일. dark 박스 제거.
// Hub 사이드바에 VFX 메뉴들이 있어 자체 Sidebar 도 없음.
import { Outlet } from "react-router-dom";

export default function Layout() {
  return <Outlet />;
}
