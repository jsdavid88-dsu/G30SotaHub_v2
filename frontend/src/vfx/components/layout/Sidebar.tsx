import { NavLink } from "react-router-dom";
import { LayoutDashboard, Calendar, GitBranch, Film, Flame, Send } from "lucide-react";

const navItems = [
  { to: "/", label: "대시보드", icon: LayoutDashboard },
  { to: "/timeline", label: "타임라인", icon: Calendar },
  { to: "/graph", label: "기술 계보", icon: GitBranch },
  { to: "/feed", label: "실전 피드", icon: Flame },
  { to: "/submit", label: "제보", icon: Send },
];

export default function Sidebar() {
  return (
    <aside className="w-60 border-r border-neutral-800 bg-neutral-900 flex flex-col">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-neutral-800">
        <Film className="h-6 w-6 text-brand-400" />
        <div>
          <div className="font-semibold text-sm">VFX SOTA</div>
          <div className="text-xs text-neutral-500">Monitor</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
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
