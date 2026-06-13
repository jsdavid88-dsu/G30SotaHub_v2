import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { useRole, type Role } from '../contexts/RoleContext'
import { useAuth } from '../contexts/AuthContext'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { api } from '../api/client'
import FeedPanel from './FeedPanel'

interface NotificationItem {
  id: string
  notification_type: string
  title: string
  body: string | null
  target_type: string | null
  target_id: string | null
  is_read: boolean
  created_at: string
}

const NOTIFICATION_TYPE_ICONS: Record<string, string> = {
  task_assigned: '\u{1F4CB}',
  task_updated: '\u{1F504}',
  daily_comment: '\u{1F4AC}',
  daily_issue: '\u{26A0}\u{FE0F}',
  attendance_missing: '\u{23F0}',
  event_reminder: '\u{1F4C5}',
  report_published: '\u{1F4CA}',
  sota_assigned: '\u{1F4D6}',
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.max(0, now - then)
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}일 전`
  return new Date(dateStr).toLocaleDateString('ko-KR')
}

function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem('token')
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
  }, [])

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/notifications/unread-count', { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        setUnreadCount(data.unread_count)
      }
    } catch {
      // silently ignore
    }
  }, [getHeaders])

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/notifications/?limit=20', { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.data)
        setUnreadCount(data.unread_count)
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false)
    }
  }, [getHeaders])

  const markAsRead = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/v1/notifications/${id}/read`, {
        method: 'PATCH',
        headers: getHeaders(),
      })
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
        )
        setUnreadCount((prev) => Math.max(0, prev - 1))
      }
    } catch {
      // silently ignore
    }
  }, [getHeaders])

  const markAllAsRead = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/notifications/read-all', {
        method: 'POST',
        headers: getHeaders(),
      })
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
        setUnreadCount(0)
      }
    } catch {
      // silently ignore
    }
  }, [getHeaders])

  // Poll unread count every 30 seconds
  useEffect(() => {
    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 30000)
    return () => clearInterval(interval)
  }, [fetchUnreadCount])

  return { notifications, unreadCount, loading, fetchNotifications, markAsRead, markAllAsRead }
}

const allNavItems = [
  {
    section: 'Main',
    items: [
      { path: '/', label: 'Dashboard', icon: DashboardIcon, roles: ['admin', 'professor', 'student', 'external'] as Role[] },
      { path: '/daily/write', label: 'Daily Write', icon: DailyWriteIcon, roles: ['student'] as Role[] },
      { path: '/daily/feed', label: 'Daily', icon: PublicationsIcon, roles: ['admin', 'professor', 'student', 'external'] as Role[] },
      { path: '/weekly', label: 'Weekly', icon: WeeklyIcon, roles: ['admin', 'professor', 'student', 'external'] as Role[] },
      { path: '/projects', label: 'Projects', icon: ProjectsIcon, roles: ['admin', 'professor', 'student', 'external'] as Role[] },
    ],
  },
  {
    section: 'Management',
    items: [
      { path: '/sota', label: 'SOTA', icon: SotaIcon, roles: ['admin', 'professor', 'student', 'external'] as Role[] },
      { path: '/reports', label: 'Reports', icon: ReportsIcon, roles: ['admin', 'professor'] as Role[] },
      { path: '/members', label: 'Students', icon: TeamIcon, roles: ['admin', 'professor'] as Role[] },
      { path: '/calendar', label: 'Calendar', icon: CalendarIcon, roles: ['admin', 'professor', 'student', 'external'] as Role[] },
      { path: '/attendance', label: 'Attendance', icon: AttendanceIcon, roles: ['admin', 'student'] as Role[] },
      { path: '/profile', label: 'Profile', icon: ProfileIcon, roles: ['admin', 'professor', 'student', 'external'] as Role[] },
      { path: '/admin', label: 'Admin', icon: AdminIcon, roles: ['admin'] as Role[] },
    ],
  },
  {
    section: 'VFX SOTA Monitor',
    items: [
      // 사이드바 비대화 방지 — 대시보드/Triage/피드 3개만. 타임라인·계보·진단은
      // VFX 대시보드 상단 서브탭(VfxSubNav), 제보하기는 대시보드 버튼으로 이동.
      { path: '/vfx', label: 'VFX 대시보드', icon: SotaIcon, roles: ['admin', 'professor', 'student', 'external'] as Role[] },
      { path: '/vfx/triage', label: 'Triage (분류)', icon: SotaIcon, roles: ['admin', 'professor'] as Role[] },
      { path: '/vfx/feed', label: 'VFX 피드', icon: PublicationsIcon, roles: ['admin', 'professor', 'student', 'external'] as Role[] },
    ],
  },
]

const roleConfig: Record<Role, { label: string; initials: string; title: string; subtitle: string; gradient: string }> = {
  admin: { label: '관리자', initials: 'AD', title: '시스템 관리자', subtitle: 'Admin', gradient: 'linear-gradient(135deg, #dc2626, #991b1b)' },
  professor: { label: '교수', initials: 'PI', title: '연구책임자', subtitle: 'PI', gradient: 'linear-gradient(135deg, #4f46e5, #3730a3)' },
  student: { label: '학생', initials: 'ST', title: '대학원생', subtitle: 'Student', gradient: 'linear-gradient(135deg, #059669, #047857)' },
  external: { label: '외부업체', initials: 'EX', title: '외부 파트너', subtitle: 'External', gradient: 'linear-gradient(135deg, #d97706, #b45309)' },
}

const roleBadgeColors: Record<Role, { bg: string; color: string }> = {
  admin: { bg: '#fee2e2', color: '#991b1b' },
  professor: { bg: '#e0e7ff', color: '#4338ca' },
  student: { bg: '#d1fae5', color: '#047857' },
  external: { bg: '#fef3c7', color: '#b45309' },
}

export default function Layout() {
  const location = useLocation()
  const { currentRole, setRole } = useRole()
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [feedCollapsed, setFeedCollapsed] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const isWide = useMediaQuery('(min-width: 1024px)')

  // Auto-close sidebar when switching to desktop
  useEffect(() => {
    if (isDesktop) setMobileOpen(false)
  }, [isDesktop])

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  // Auto-collapse feed panel on mobile
  useEffect(() => {
    if (!isDesktop) setFeedCollapsed(true)
  }, [isDesktop])

  // Push notification subscription setup
  useEffect(() => {
    async function setupPush() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
      try {
        const reg = await navigator.serviceWorker.register('/sw.js')
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return

        const vapidRes: any = await api.push.vapidKey()
        if (!vapidRes.publicKey) return

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidRes.publicKey,
        })
        const subJson = sub.toJSON()
        if (subJson.endpoint && subJson.keys) {
          await api.push.subscribe({
            endpoint: subJson.endpoint,
            p256dh: subJson.keys.p256dh!,
            auth: subJson.keys.auth!,
          })
        }
      } catch (err) {
        console.error('Push setup failed:', err)
      }
    }
    setupPush()
  }, [])

  const navItems = allNavItems.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.includes(currentRole)),
  })).filter((group) => group.items.length > 0)

  const rc = roleConfig[currentRole]
  const rb = roleBadgeColors[currentRole]

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', background: '#f8fafc' }}>
      {/* Mobile overlay */}
      {!isDesktop && mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }}
        />
      )}

      {/* Sidebar */}
      <aside
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: '#0f172a',
          transition: 'transform 0.3s ease',
          ...(isDesktop
            ? { width: 240, minWidth: 240, flexShrink: 0, position: 'relative' as const }
            : {
                position: 'fixed' as const, top: 0, left: 0, bottom: 0, zIndex: 50,
                width: 260,
                transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
              }),
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', height: 60, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>R</span>
          </div>
          <span style={{ color: '#f8fafc', fontWeight: 600, fontSize: 15 }}>R&D Hub</span>
        </div>

        <nav style={{ flex: 1, overflowY: 'auto', padding: '16px 12px' }}>
          {navItems.map((group) => (
            <div key={group.section} style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'rgba(148,163,184,0.5)', padding: '0 8px', marginBottom: 8 }}>
                {group.section}
              </p>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
                {group.items.map((item) => {
                  const active = location.pathname === item.path
                  return (
                    <li key={item.path}>
                      <Link
                        to={item.path}
                        onClick={() => setMobileOpen(false)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '8px 10px', borderRadius: 8,
                          fontSize: 13, fontWeight: 500, textDecoration: 'none',
                          background: active ? '#1e293b' : 'transparent',
                          color: active ? '#f8fafc' : '#94a3b8',
                        }}
                      >
                        <item.icon active={active} />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Header */}
        <header style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', background: '#fff', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {!isDesktop && (
              <button
                onClick={() => setMobileOpen(true)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#475569' }}
              >
                <svg style={{ width: 20, height: 20 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: '#1e293b' }}>
              {getPageTitle(location.pathname)}
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: isDesktop ? 16 : 8 }}>
            {/* DEV Role Switcher — hidden on mobile */}
            {isDesktop && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 6px', borderRadius: 10,
                background: '#fef3c7', border: '1px solid #fbbf24',
              }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#92400e', padding: '0 4px', whiteSpace: 'nowrap' as const }}>
                  [DEV] 역할 전환
                </span>
                {(['admin', 'professor', 'student', 'external'] as Role[]).map((role) => {
                  const active = currentRole === role
                  const labels: Record<Role, string> = { admin: '관리자', professor: '교수', student: '학생', external: '외부업체' }
                  return (
                    <button
                      key={role}
                      onClick={() => setRole(role)}
                      style={{
                        padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        border: 'none', cursor: 'pointer',
                        background: active ? '#4f46e5' : 'transparent',
                        color: active ? '#fff' : '#92400e',
                        transition: 'all 0.15s',
                      }}
                    >
                      {labels[role]}
                    </button>
                  )
                })}
              </div>
            )}

            <NotificationBell />
            <div style={{ display: 'flex', alignItems: 'center', gap: isDesktop ? 12 : 8, paddingLeft: isDesktop ? 16 : 8, borderLeft: '1px solid #e2e8f0' }}>
              <div style={{ position: 'relative' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: rc.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>{rc.initials}</span>
                </div>
                {/* Role badge */}
                <span style={{
                  position: 'absolute', bottom: -4, right: -8,
                  padding: '1px 5px', borderRadius: 99, fontSize: 8, fontWeight: 700,
                  background: rb.bg, color: rb.color,
                  border: '1.5px solid #fff',
                  whiteSpace: 'nowrap' as const,
                }}>
                  {rc.label}
                </span>
              </div>
              {isWide && (
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', lineHeight: 1 }}>{user?.name ?? rc.title}</p>
                  <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{rc.subtitle}</p>
                </div>
              )}
              <button onClick={logout} title="로그아웃" style={{ padding: 6, borderRadius: 8, display: 'flex', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* Page content + Feed panel */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <main style={{ flex: 1, overflowY: 'auto', background: '#f8fafc', padding: isWide ? '28px 32px' : isDesktop ? '24px 20px' : '16px 12px' }}>
            {/* #17: lazy route 페이지 로딩 동안 사이드바/헤더 유지, 본문만 fallback */}
            <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0', color: '#94a3b8', fontSize: 13 }}>로딩 중...</div>}>
              <Outlet />
            </Suspense>
          </main>
          <FeedPanel
            collapsed={feedCollapsed}
            onToggle={() => setFeedCollapsed(c => !c)}
          />
        </div>
      </div>
    </div>
  )
}

function NotificationBell() {
  const { notifications, unreadCount, loading, fetchNotifications, markAsRead, markAllAsRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleToggle = () => {
    const next = !open
    setOpen(next)
    if (next) fetchNotifications()
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={handleToggle}
        style={{ position: 'relative', padding: 8, borderRadius: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#475569' }}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 4, right: 4,
            minWidth: 16, height: 16, borderRadius: 99,
            background: '#ef4444', color: '#fff',
            fontSize: 10, fontWeight: 700, lineHeight: '16px',
            textAlign: 'center' as const, padding: '0 4px',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4,
          width: 'min(360px, calc(100vw - 24px))', maxHeight: 400,
          background: '#fff', borderRadius: 12,
          boxShadow: '0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)',
          border: '1px solid #e2e8f0',
          display: 'flex', flexDirection: 'column' as const,
          zIndex: 100,
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '1px solid #f1f5f9',
          }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
              알림 {unreadCount > 0 && <span style={{ color: '#4f46e5' }}>({unreadCount})</span>}
            </span>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading && notifications.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center' as const, color: '#94a3b8', fontSize: 13 }}>
                로딩 중...
              </div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center' as const, color: '#94a3b8', fontSize: 13 }}>
                알림이 없습니다
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => { if (!n.is_read) markAsRead(n.id) }}
                  style={{
                    display: 'flex', gap: 10, padding: '10px 16px',
                    background: n.is_read ? '#fff' : '#eff6ff',
                    cursor: n.is_read ? 'default' : 'pointer',
                    borderBottom: '1px solid #f8fafc',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => { if (!n.is_read) (e.currentTarget as HTMLDivElement).style.background = '#dbeafe' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = n.is_read ? '#fff' : '#eff6ff' }}
                >
                  {/* Type icon */}
                  <span style={{ fontSize: 18, flexShrink: 0, lineHeight: '24px' }}>
                    {NOTIFICATION_TYPE_ICONS[n.notification_type] || '\u{1F514}'}
                  </span>
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: n.is_read ? 400 : 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                        {n.title}
                      </span>
                      {!n.is_read && (
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4f46e5', flexShrink: 0 }} />
                      )}
                    </div>
                    {n.body && (
                      <p style={{
                        fontSize: 12, color: '#64748b', marginTop: 2, lineHeight: 1.4,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                      }}>
                        {n.body}
                      </p>
                    )}
                    <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, display: 'block' }}>
                      {timeAgo(n.created_at)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div style={{ borderTop: '1px solid #f1f5f9', padding: '8px 16px', display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
            {notifications.length > 0 && unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                style={{
                  width: '100%', padding: '6px 0',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 500, color: '#4f46e5',
                  borderRadius: 6,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#f8fafc' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
              >
                모두 읽음
              </button>
            )}
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              style={{
                display: 'block', width: '100%', padding: '6px 0',
                textAlign: 'center' as const, textDecoration: 'none',
                fontSize: 13, fontWeight: 500, color: '#64748b',
                borderRadius: 6,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = '#f8fafc'; (e.currentTarget as HTMLAnchorElement).style.color = '#4f46e5' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'none'; (e.currentTarget as HTMLAnchorElement).style.color = '#64748b' }}
            >
              전체 보기
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function getPageTitle(path: string) {
  const titles: Record<string, string> = {
    '/': 'Dashboard', '/projects': 'Projects', '/daily/feed': 'Daily',
    '/daily/write': 'Daily Write', '/weekly': 'Weekly', '/sota': 'SOTA', '/reports': 'Reports',
    '/members': 'Students', '/calendar': 'Calendar',
    '/attendance': 'Attendance', '/profile': 'Profile', '/admin': 'Admin', '/notifications': '알림',
  }
  return titles[path] || 'R&D Hub'
}

function DashboardIcon({ active }: { active: boolean }) {
  return <svg style={{ width: 18, height: 18, color: active ? '#4f46e5' : undefined }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 13a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z" /></svg>
}
function ProjectsIcon({ active }: { active: boolean }) {
  return <svg style={{ width: 18, height: 18, color: active ? '#4f46e5' : undefined }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
}
function PublicationsIcon({ active }: { active: boolean }) {
  return <svg style={{ width: 18, height: 18, color: active ? '#4f46e5' : undefined }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
}
function TeamIcon({ active }: { active: boolean }) {
  return <svg style={{ width: 18, height: 18, color: active ? '#4f46e5' : undefined }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
}
function CalendarIcon({ active }: { active: boolean }) {
  return <svg style={{ width: 18, height: 18, color: active ? '#4f46e5' : undefined }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
}
function BellIcon() {
  return <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
}
function DailyWriteIcon({ active }: { active: boolean }) {
  return <svg style={{ width: 18, height: 18, color: active ? '#4f46e5' : undefined }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
}
function WeeklyIcon({ active }: { active: boolean }) {
  return <svg style={{ width: 18, height: 18, color: active ? '#4f46e5' : undefined }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /><path strokeLinecap="round" strokeLinejoin="round" d="M9 16h6" /></svg>
}
function AttendanceIcon({ active }: { active: boolean }) {
  return <svg style={{ width: 18, height: 18, color: active ? '#4f46e5' : undefined }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
}
function ProfileIcon({ active }: { active: boolean }) {
  return <svg style={{ width: 18, height: 18, color: active ? '#4f46e5' : undefined }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
}
function SotaIcon({ active }: { active: boolean }) {
  return <svg style={{ width: 18, height: 18, color: active ? '#4f46e5' : undefined }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
}
function ReportsIcon({ active }: { active: boolean }) {
  return <svg style={{ width: 18, height: 18, color: active ? '#4f46e5' : undefined }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
}
function AdminIcon({ active }: { active: boolean }) {
  return <svg style={{ width: 18, height: 18, color: active ? '#4f46e5' : undefined }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
}
