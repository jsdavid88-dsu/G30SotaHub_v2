import { Link, NavLink } from "react-router-dom";
import { LayoutDashboard, Calendar, GitBranch, Film, Flame, Send, ArrowLeft } from "lucide-react";

// 통합 환경: 모든 path 가 /vfx prefix 아래
const navItems = [
  { to: "/vfx", label: "대시보드", icon: LayoutDashboard, end: true },
  { to: "/vfx/timeline", label: "타임라인", icon: Calendar, end: false },
  { to: "/vfx/graph", label: "기술 계보", icon: GitBranch, end: false },
  { to: "/vfx/feed", label: "실전 피드", icon: Flame, end: false },
  { to: "/vfx/submit", label: "제보", icon: Send, end: false },
];

export default function Sidebar() {
  return (
    <aside className="w-60 border-r border-neutral-800 bg-neutral-900 flex flex-col">
      {/* Hub 로 돌아가기 — 통합 환경 */}
      <Link
        to="/"
        className="flex items-center gap-2 px-5 py-3 border-b border-neutral-800 text-xs text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition"
      >
        <ArrowLeft className="h-3 w-3" />
        R&D Hub 로 돌아가기
      </Link>

      <div className="flex items-center gap-3 px-5 py-5 border-b border-neutral-800">
        <Film className="h-6 w-6 text-brand-400" />
        <div>
          <div className="font-semibold text-sm">VFX SOTA</div>
          <div className="text-xs text-neutral-500">Monitor</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
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

      <div className="px-5 py-4 border-t border-neutral-800 text-xs text-neutral-500">
        Red Cat Gang · DSU
      </div>
    </aside>
  );
}
