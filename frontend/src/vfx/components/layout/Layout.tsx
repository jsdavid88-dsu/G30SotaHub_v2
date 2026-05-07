// VFX Layout — Hub light 테마와 통일. dark 박스 제거.
// Hub 사이드바에 VFX 메뉴들이 있어 자체 Sidebar 도 없음.
// RunStatusBar 는 모든 VFX 페이지 상단에 sticky.
import { Outlet } from "react-router-dom";
import RunStatusBar from "../RunStatusBar";

export default function Layout() {
  return (
    <>
      <RunStatusBar />
      <Outlet />
    </>
  );
}
