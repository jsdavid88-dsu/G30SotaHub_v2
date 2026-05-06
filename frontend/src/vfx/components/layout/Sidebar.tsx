// VFX Sidebar — Hub Layout 안에서 두 번째 사이드바로 표시.
// Hub Sidebar 가 항상 옆에 있으므로 'Hub 으로 돌아가기' 링크 제거.
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Calendar, GitBranch, Film, Flame, Send } from "lucide-react";

const navItems = [
  { to: "/vfx", label: "대시보드", icon: LayoutDashboard, end: true },
  { to: "/vfx/timeline", label: "타임라인", icon: Calendar, end: false },
  { to: "/vfx/graph", label: "기술 계보", icon: GitBranch, end: false },
  { to: "/vfx/feed", label: "실전 피드", icon: Flame, end: false },
  { to: "/vfx/submit", label: "제보", icon: Send, end: false },
];

export default function Sidebar() {
  return (
    <aside className="w-52 shrink-0 border-r border-neutral-800 bg-neutral-900 flex flex-col">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-neutral-800">
        <Film className="h-5 w-5 text-brand-400" />
        <div>
          <div className="font-semibold text-sm">VFX SOTA</div>
          <div className="text-[10px] text-neutral-500">Monitor</div>
        </div>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-1">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                isActive
                  ? "bg-brand-600/20 text-brand-300"
                  : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
              }`
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-neutral-800 text-[10px] text-neutral-500">
        Red Cat Gang · DSU
      </div>
    </aside>
  );
}
