import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useRole, isPrivileged } from '../contexts/RoleContext'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../api/client'

// ── Types ──────────────────────────────────────────────────

type UserInfo = {
  id: string
  name: string
  email: string
  role: string
  status: string
  major_field?: string
  interest_fields?: string[]
  company?: string
  last_login_at?: string
  created_at?: string
}

type ProjectInfo = {
  id: string
  name: string
  code?: string
  status?: string
}

type AdvisorRelation = {
  id: string
  professor_id: string
  student_id: string
  professor?: { id: string; name: string; email: string } | null
  student?: { id: string; name: string; email: string } | null
}

type TaskItem = {
  id: string
  title: string
  status: string
  priority: string
  due_date?: string
  project_id?: string
  project_name?: string
}

type DailyLog = {
  id: string
  log_date: string
  created_at: string
  blocks?: { id: string; content: string; block_type: string }[]
  project_tags?: string[]
  author_id?: string
  author_name?: string
}

type AttendanceRecord = {
  id: string
  date: string
  check_in?: string
  check_out?: string
  status: string
  hours?: number
}

type AttendanceStats = {
  total_days?: number
  avg_hours?: number
  late_count?: number
  absent_count?: number
  present_count?: number
}

type SotaAssignmentRow = {
  id: string
  status: string
  due_date?: string
  item_title?: string
  item_url?: string
  item_priority?: string
  reviews?: { id: string; content: string; created_at?: string }[]
}

type TabKey = 'overview' | 'sota' | 'tasks' | 'daily' | 'attendance'

// ── Constants ──────────────────────────────────────────────

const roleDisplayMap: Record<string, string> = {
  professor: '교수',
  student: '학생',
  external: '외부 파트너',
}

const statusDisplayMap: Record<string, { label: string; bg: string; color: string }> = {
  active: { label: '재직', bg: '#d1fae5', color: '#047857' },
  inactive: { label: '비활성', bg: '#fee2e2', color: '#dc2626' },
}

const taskStatusLabels: Record<string, { label: string; bg: string; color: string }> = {
  todo: { label: '할 일', bg: '#f1f5f9', color: '#64748b' },
  in_progress: { label: '진행중', bg: '#e0e7ff', color: '#4338ca' },
  blocked: { label: '차단', bg: '#fee2e2', color: '#dc2626' },
  review: { label: '리뷰', bg: '#fef3c7', color: '#b45309' },
  done: { label: '완료', bg: '#d1fae5', color: '#047857' },
}

const avatarColors = ['#4f46e5', '#059669', '#d97706', '#e11d48', '#0284c7', '#7c3aed', '#64748b', '#b45309']

const cardStyle = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
}

// ── Component ──────────────────────────────────────────────

export default function MemberDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentRole } = useRole()
  const { user: currentUser } = useAuth()

  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [advisorRelations, setAdvisorRelations] = useState<AdvisorRelation[]>([])
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([])
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([])
  const [attendanceStats, setAttendanceStats] = useState<AttendanceStats>({})
  const [assignments, setAssignments] = useState<SotaAssignmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('overview')

  // Determine avatar color from user id
  const avatarColor = useMemo(() => {
    if (!id) return avatarColors[0]
    let hash = 0
    for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
    return avatarColors[Math.abs(hash) % avatarColors.length]
  }, [id])

  // Permission check: which tabs to show
  const visibleTabs = useMemo<{ key: TabKey; label: string }[]>(() => {
    const tabs: { key: TabKey; label: string }[] = [{ key: 'overview', label: '개요' }]
    if (isPrivileged(currentRole) || currentUser?.id === id) {
      tabs.push({ key: 'sota', label: 'SOTA 배정' })
      tabs.push({ key: 'tasks', label: '태스크' })
      tabs.push({ key: 'daily', label: '데일리' })
      tabs.push({ key: 'attendance', label: '출결' })
    } else if (currentRole === 'student') {
      // Students can see overview only for other students
    }
    // External: overview only
    return tabs
  }, [currentRole, currentUser?.id, id])

  // ── Load base data ──────────────────────────────────────

  useEffect(() => {
    if (!id) return

    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        // Fetch user info and advisor relations in parallel
        const [userRes, advisorRes, assignRes] = await Promise.all([
          api.users.get(id).catch(() => null),
          (async () => {
            try {
              const token = localStorage.getItem('token')
              const res = await fetch(`/api/v1/users/${id}/advisors`, {
                headers: {
                  'Content-Type': 'application/json',
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
              })
              if (res.ok) return await res.json()
            } catch { /* ignore */ }
            return { data: [] }
          })(),
          (async () => {
            // 이 학생이 배정받은 SOTA 모델/논문 (admin/professor or 본인만 — 아니면 403→[])
            try {
              const token = localStorage.getItem('token')
              const res = await fetch(`/api/v1/sota/assignments?assignee_id=${id}`, {
                headers: {
                  'Content-Type': 'application/json',
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
              })
              if (res.ok) return await res.json()
            } catch { /* ignore */ }
            return []
          })(),
        ])

        if (!userRes) {
          setError('구성원 정보를 찾을 수 없습니다.')
          setLoading(false)
          return
        }

        const user = userRes as any
        setUserInfo({
          id: user.id,
          name: user.name || '',
          email: user.email || '',
          role: user.role || '',
          status: user.status || 'active',
          major_field: user.major_field,
          interest_fields: user.interest_fields,
          company: user.company,
          last_login_at: user.last_login_at,
          created_at: user.created_at,
        })

        setAdvisorRelations(advisorRes?.data || [])
        setAssignments(Array.isArray(assignRes) ? assignRes : (assignRes?.data || []))

        // Fetch projects and find memberships
        try {
          const projRes: any = await api.projects.list()
          const allProjects: any[] = projRes?.data || []
          const memberProjects: ProjectInfo[] = []

          await Promise.all(
            allProjects.map(async (proj: any) => {
              try {
                const membersRes: any = await api.projects.members(proj.id)
                const members: any[] = membersRes?.data || membersRes || []
                if (members.some((m: any) => (m.user_id || m.id) === id)) {
                  memberProjects.push({
                    id: proj.id,
                    name: proj.name,
                    code: proj.code,
                    status: proj.status,
                  })
                }
              } catch { /* ignore */ }
            })
          )
          setProjects(memberProjects)
        } catch { setProjects([]) }
      } catch {
        setError('데이터를 불러오는 중 오류가 발생했습니다.')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [id])

  // ── Load tab-specific data on tab change ────────────────

  useEffect(() => {
    if (!id || !userInfo) return

    if (activeTab === 'tasks') {
      loadTasks()
    } else if (activeTab === 'daily') {
      loadDailyLogs()
    } else if (activeTab === 'attendance') {
      loadAttendance()
    }
  }, [activeTab, id, userInfo]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadTasks = async () => {
    try {
      // Load tasks from each project the user belongs to
      const allTasks: TaskItem[] = []
      await Promise.all(
        projects.map(async (proj) => {
          try {
            const res: any = await api.tasks.listByProject(proj.id)
            const items: any[] = res?.data || res || []
            items.forEach((t: any) => {
              const assignees: any[] = t.assignees || []
              if (assignees.some((a: any) => a.user_id === id)) {
                allTasks.push({
                  id: t.id,
                  title: t.title,
                  status: t.status,
                  priority: t.priority || 'medium',
                  due_date: t.due_date,
                  project_id: proj.id,
                  project_name: proj.name,
                })
              }
            })
          } catch { /* ignore */ }
        })
      )
      setTasks(allTasks)
    } catch { setTasks([]) }
  }

  const loadDailyLogs = async () => {
    try {
      const res: any = await api.daily.list({ author_id: id!, limit: '20' })
      const items: any[] = res?.data || res || []
      setDailyLogs(
        items.map((d: any) => ({
          id: d.id,
          log_date: d.log_date,
          created_at: d.created_at,
          blocks: d.blocks || [],
          project_tags: d.project_tags || d.tags || [],
          author_id: d.author_id,
          author_name: d.author_name,
        }))
      )
    } catch { setDailyLogs([]) }
  }

  const loadAttendance = async () => {
    try {
      const [historyRes, statsRes] = await Promise.all([
        api.attendance.history({ user_id: id!, limit: '20' }).catch(() => ({ data: [] })),
        api.attendance.stats({ user_id: id! }).catch(() => ({})),
      ]) as [any, any]

      const historyItems: any[] = historyRes?.data || historyRes || []
      setAttendanceHistory(
        historyItems.map((r: any) => ({
          id: r.id || r.date,
          date: r.date,
          check_in: r.check_in,
          check_out: r.check_out,
          status: r.status || 'present',
          hours: r.hours || r.total_hours,
        }))
      )

      setAttendanceStats({
        total_days: statsRes?.total_days ?? statsRes?.data?.total_days,
        avg_hours: statsRes?.avg_hours ?? statsRes?.data?.avg_hours,
        present_count: statsRes?.present_count ?? statsRes?.data?.present_count,
        late_count: statsRes?.late_count ?? statsRes?.data?.late_count,
        absent_count: statsRes?.absent_count ?? statsRes?.data?.absent_count,
      })
    } catch {
      setAttendanceHistory([])
      setAttendanceStats({})
    }
  }

  // ── Task stats ──────────────────────────────────────────

  const taskStats = useMemo(() => {
    const counts: Record<string, number> = {}
    tasks.forEach((t) => {
      counts[t.status] = (counts[t.status] || 0) + 1
    })
    return counts
  }, [tasks])

  const tasksByProject = useMemo(() => {
    const grouped: Record<string, { name: string; tasks: TaskItem[] }> = {}
    tasks.forEach((t) => {
      const key = t.project_id || 'unknown'
      if (!grouped[key]) grouped[key] = { name: t.project_name || '기타', tasks: [] }
      grouped[key].tasks.push(t)
    })
    return Object.values(grouped)
  }, [tasks])

  // ── Render: Loading / Error ─────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: '48px', color: '#94a3b8', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', width: 24, height: 24, border: '2.5px solid #e2e8f0', borderTopColor: '#4f46e5', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ marginTop: 12, fontSize: 14 }}>로딩 중...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (error || !userInfo) {
    return (
      <div style={{ padding: '48px', textAlign: 'center' }}>
        <p style={{ color: '#ef4444', fontSize: 15, marginBottom: 12 }}>{error || '구성원 정보를 찾을 수 없습니다.'}</p>
        <button
          onClick={() => navigate('/members')}
          style={{
            padding: '8px 20px', borderRadius: 8, border: '1px solid #e2e8f0',
            background: '#fff', color: '#475569', fontSize: 13, cursor: 'pointer',
          }}
        >
          목록으로 돌아가기
        </button>
      </div>
    )
  }

  const statusInfo = statusDisplayMap[userInfo.status] || statusDisplayMap.active

  // ── Render ──────────────────────────────────────────────

  return (
    <div style={{ width: '100%' }}>
      {/* Back button */}
      <button
        onClick={() => navigate('/members')}
        className="animate-fade-in"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 14px', borderRadius: 8, border: '1px solid #e2e8f0',
          background: '#fff', color: '#64748b', fontSize: 13, cursor: 'pointer',
          marginBottom: 20, transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = '#fff' }}
      >
        <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        구성원 목록
      </button>

      {/* ── Header Card ── */}
      <div className="animate-fade-in" style={{ ...cardStyle, padding: 28, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
          {/* Avatar */}
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}dd)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span style={{ color: '#fff', fontSize: 28, fontWeight: 700 }}>
              {userInfo.name.charAt(0)}
            </span>
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              <h1 style={{ fontSize: 24, fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-display)', margin: 0 }}>
                {userInfo.name}
              </h1>
              {/* Role badge */}
              <span style={{
                padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 500,
                background: '#e0e7ff', color: '#4338ca',
              }}>
                {roleDisplayMap[userInfo.role] || userInfo.role}
              </span>
              {/* Status badge */}
              <span style={{
                padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 500,
                background: statusInfo.bg, color: statusInfo.color,
              }}>
                {statusInfo.label}
              </span>
            </div>

            {/* Details grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, color: '#64748b' }}>
              {/* Email */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg style={{ width: 15, height: 15, flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span>{userInfo.email}</span>
              </div>
              {/* Major field */}
              {userInfo.major_field && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg style={{ width: 15, height: 15, flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  <span>{userInfo.major_field}</span>
                </div>
              )}
              {/* Company */}
              {userInfo.company && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg style={{ width: 15, height: 15, flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span>{userInfo.company}</span>
                </div>
              )}
              {/* Interest fields */}
              {userInfo.interest_fields && userInfo.interest_fields.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 4 }}>
                  <svg style={{ width: 15, height: 15, flexShrink: 0, marginTop: 2 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {userInfo.interest_fields.map((field, i) => (
                      <span key={i} style={{
                        padding: '2px 10px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                        background: '#f0fdf4', color: '#16a34a',
                      }}>
                        {field}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="opacity-0 animate-fade-in stagger-1" style={{
        display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #e2e8f0', paddingBottom: 0,
      }}>
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '10px 20px', fontSize: 14, fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? '#4f46e5' : '#64748b',
              background: 'transparent', border: 'none', cursor: 'pointer',
              borderBottom: activeTab === tab.key ? '2px solid #4f46e5' : '2px solid transparent',
              transition: 'all 0.15s', marginBottom: -1,
            }}
            onMouseEnter={(e) => { if (activeTab !== tab.key) e.currentTarget.style.color = '#334155' }}
            onMouseLeave={(e) => { if (activeTab !== tab.key) e.currentTarget.style.color = '#64748b' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div className="opacity-0 animate-fade-in stagger-2">
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'sota' && renderSota()}
        {activeTab === 'tasks' && renderTasks()}
        {activeTab === 'daily' && renderDaily()}
        {activeTab === 'attendance' && renderAttendance()}
      </div>
    </div>
  )

  // ── Tab: Overview ──────────────────────────────────────

  function renderOverview() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Projects */}
        <div style={{ ...cardStyle, padding: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg style={{ width: 16, height: 16, color: '#4f46e5' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            소속 프로젝트
          </h3>
          {projects.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: 13 }}>소속된 프로젝트가 없습니다.</p>
          ) : (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {projects.map((p) => (
                <div
                  key={p.id}
                  onClick={() => navigate(`/projects/${p.id}`)}
                  style={{
                    padding: '12px 20px', borderRadius: 12, cursor: 'pointer',
                    border: '1px solid #e2e8f0', background: '#fafafa',
                    transition: 'all 0.15s', minWidth: 140,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#c7d2fe'
                    e.currentTarget.style.background = '#f5f3ff'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e2e8f0'
                    e.currentTarget.style.background = '#fafafa'
                  }}
                >
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{p.name}</p>
                  {p.code && <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{p.code}</p>}
                  {p.status && (
                    <span style={{
                      display: 'inline-block', marginTop: 6,
                      padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 500,
                      background: p.status === 'active' ? '#d1fae5' : '#f1f5f9',
                      color: p.status === 'active' ? '#047857' : '#64748b',
                    }}>
                      {p.status === 'active' ? '진행중' : p.status}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Advisor / Advisee info */}
        {advisorRelations.length > 0 && (
          <div style={{ ...cardStyle, padding: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg style={{ width: 16, height: 16, color: '#f59e0b' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              지도 관계
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {advisorRelations.map((rel) => {
                const isProfessor = rel.professor_id === id
                const other = isProfessor ? rel.student : rel.professor
                return (
                  <div key={rel.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 16px', borderRadius: 10, background: '#fafafa',
                  }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: isProfessor ? '#dbeafe' : '#fef3c7',
                      color: isProfessor ? '#1d4ed8' : '#b45309',
                    }}>
                      {isProfessor ? '지도학생' : '지도교수'}
                    </span>
                    <span
                      style={{ fontSize: 14, color: '#334155', cursor: 'pointer' }}
                      onClick={() => {
                        const otherId = isProfessor ? rel.student_id : rel.professor_id
                        if (otherId) navigate(`/members/${otherId}`)
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#4f46e5' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#334155' }}
                    >
                      {other?.name || '(알 수 없음)'}
                    </span>
                    {other?.email && currentRole !== 'external' && (
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>({other.email})</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Recent activity summary */}
        <div style={{ ...cardStyle, padding: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg style={{ width: 16, height: 16, color: '#059669' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            최근 활동 요약
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            <div style={{ padding: '14px 16px', borderRadius: 10, background: '#f8fafc', textAlign: 'center' }}>
              <p style={{ fontSize: 22, fontWeight: 700, color: '#4f46e5' }}>{projects.length}</p>
              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>소속 프로젝트</p>
            </div>
            <div style={{ padding: '14px 16px', borderRadius: 10, background: '#f8fafc', textAlign: 'center' }}>
              <p style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>{advisorRelations.length}</p>
              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>지도 관계</p>
            </div>
            <div style={{ padding: '14px 16px', borderRadius: 10, background: '#f8fafc', textAlign: 'center' }}>
              <p style={{ fontSize: 22, fontWeight: 700, color: '#7c3aed' }}>{assignments.length}</p>
              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>SOTA 배정</p>
            </div>
            {userInfo?.last_login_at && (
              <div style={{ padding: '14px 16px', borderRadius: 10, background: '#f8fafc', textAlign: 'center' }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                  {new Date(userInfo.last_login_at).toLocaleDateString('ko-KR')}
                </p>
                <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>최근 로그인</p>
              </div>
            )}
            {userInfo?.created_at && (
              <div style={{ padding: '14px 16px', borderRadius: 10, background: '#f8fafc', textAlign: 'center' }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                  {new Date(userInfo.created_at).toLocaleDateString('ko-KR')}
                </p>
                <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>가입일</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Tab: SOTA 배정 ──────────────────────────────────────

  function renderSota() {
    const statusMap: Record<string, { label: string; bg: string; color: string }> = {
      assigned: { label: '배정됨', bg: '#e0e7ff', color: '#4338ca' },
      in_review: { label: '검토중', bg: '#fef3c7', color: '#b45309' },
      reviewing: { label: '검토중', bg: '#fef3c7', color: '#b45309' },
      in_progress: { label: '진행중', bg: '#e0e7ff', color: '#4338ca' },
      completed: { label: '완료', bg: '#d1fae5', color: '#047857' },
      done: { label: '완료', bg: '#d1fae5', color: '#047857' },
      archived: { label: '보류', bg: '#f1f5f9', color: '#64748b' },
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {assignments.length === 0 ? (
          <div style={{ ...cardStyle, padding: 40, textAlign: 'center' }}>
            <p style={{ color: '#94a3b8', fontSize: 14 }}>배정받은 SOTA 모델·논문이 없습니다.</p>
          </div>
        ) : (
          assignments.map((a) => {
            const st = statusMap[a.status] || statusMap.assigned
            const lastReview = a.reviews && a.reviews.length > 0 ? a.reviews[a.reviews.length - 1] : null
            return (
              <div key={a.id} style={{ ...cardStyle, padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{a.item_title || '(제목 없음)'}</p>
                    <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 11, color: '#94a3b8' }}>
                      {a.item_priority && (
                        <span style={{ padding: '2px 8px', borderRadius: 6, background: '#f1f5f9', color: '#475569', fontWeight: 500 }}>{a.item_priority}</span>
                      )}
                      {a.due_date && <span>마감 {new Date(a.due_date).toLocaleDateString('ko-KR')}</span>}
                      <span>리뷰 {a.reviews?.length || 0}건</span>
                      {a.item_url && (
                        <a href={a.item_url} target="_blank" rel="noreferrer" style={{ color: '#4f46e5', textDecoration: 'none' }}>원문 ↗</a>
                      )}
                    </div>
                  </div>
                  <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 500, background: st.bg, color: st.color, whiteSpace: 'nowrap' }}>
                    {st.label}
                  </span>
                </div>
                {lastReview && (
                  <p style={{
                    marginTop: 10, fontSize: 12, color: '#64748b', lineHeight: 1.5,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any,
                  }}>
                    최근 리뷰: {lastReview.content}
                  </p>
                )}
              </div>
            )
          })
        )}
      </div>
    )
  }

  // ── Tab: Tasks ─────────────────────────────────────────

  function renderTasks() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Status breakdown */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {Object.entries(taskStatusLabels).map(([key, info]) => (
            <div key={key} style={{
              ...cardStyle, padding: '14px 20px', flex: '1 1 100px', minWidth: 100, textAlign: 'center',
            }}>
              <p style={{ fontSize: 22, fontWeight: 700, color: info.color }}>{taskStats[key] || 0}</p>
              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, fontWeight: 500 }}>{info.label}</p>
            </div>
          ))}
        </div>

        {/* Tasks grouped by project */}
        {tasksByProject.length === 0 ? (
          <div style={{ ...cardStyle, padding: 40, textAlign: 'center' }}>
            <p style={{ color: '#94a3b8', fontSize: 14 }}>배정된 태스크가 없습니다.</p>
          </div>
        ) : (
          tasksByProject.map((group) => (
            <div key={group.name} style={{ ...cardStyle, padding: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg style={{ width: 15, height: 15, color: '#4f46e5' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                {group.name}
                <span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8' }}>({group.tasks.length})</span>
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {group.tasks.map((task) => {
                  const statusInfo = taskStatusLabels[task.status] || taskStatusLabels.todo
                  return (
                    <div key={task.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', borderRadius: 10, background: '#fafafa',
                      gap: 12, flexWrap: 'wrap',
                    }}>
                      <div style={{ flex: 1, minWidth: 150 }}>
                        <p style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{task.title}</p>
                        {task.due_date && (
                          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                            마감: {new Date(task.due_date).toLocaleDateString('ko-KR')}
                          </p>
                        )}
                      </div>
                      <span style={{
                        padding: '2px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                        background: statusInfo.bg, color: statusInfo.color, whiteSpace: 'nowrap',
                      }}>
                        {statusInfo.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>
    )
  }

  // ── Tab: Daily Logs ────────────────────────────────────

  function renderDaily() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {dailyLogs.length === 0 ? (
          <div style={{ ...cardStyle, padding: 40, textAlign: 'center' }}>
            <p style={{ color: '#94a3b8', fontSize: 14 }}>작성된 데일리 로그가 없습니다.</p>
          </div>
        ) : (
          dailyLogs.map((log) => (
            <div key={log.id} style={{ ...cardStyle, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                    {new Date(log.log_date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
                  </span>
                  <span style={{
                    padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 500,
                    background: '#f1f5f9', color: '#64748b',
                  }}>
                    {log.blocks?.length || 0}개 블록
                  </span>
                </div>
                {/* Project tags */}
                {log.project_tags && log.project_tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {log.project_tags.map((tag, i) => (
                      <span key={i} style={{
                        padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 500,
                        background: '#ede9fe', color: '#6d28d9',
                      }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {/* Show first block content preview */}
              {log.blocks && log.blocks.length > 0 && (
                <p style={{
                  fontSize: 13, color: '#64748b', lineHeight: 1.5,
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any,
                }}>
                  {log.blocks[0].content}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    )
  }

  // ── Tab: Attendance ────────────────────────────────────

  function renderAttendance() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Monthly stats */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ ...cardStyle, padding: '14px 20px', flex: '1 1 120px', minWidth: 120, textAlign: 'center' }}>
            <p style={{ fontSize: 22, fontWeight: 700, color: '#4f46e5' }}>{attendanceStats.total_days ?? attendanceStats.present_count ?? '-'}</p>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, fontWeight: 500 }}>출석 일수</p>
          </div>
          <div style={{ ...cardStyle, padding: '14px 20px', flex: '1 1 120px', minWidth: 120, textAlign: 'center' }}>
            <p style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>
              {attendanceStats.avg_hours != null ? `${attendanceStats.avg_hours.toFixed(1)}h` : '-'}
            </p>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, fontWeight: 500 }}>평균 시간</p>
          </div>
          <div style={{ ...cardStyle, padding: '14px 20px', flex: '1 1 120px', minWidth: 120, textAlign: 'center' }}>
            <p style={{ fontSize: 22, fontWeight: 700, color: '#f59e0b' }}>{attendanceStats.late_count ?? '-'}</p>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, fontWeight: 500 }}>지각</p>
          </div>
          <div style={{ ...cardStyle, padding: '14px 20px', flex: '1 1 120px', minWidth: 120, textAlign: 'center' }}>
            <p style={{ fontSize: 22, fontWeight: 700, color: '#ef4444' }}>{attendanceStats.absent_count ?? '-'}</p>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, fontWeight: 500 }}>결석</p>
          </div>
        </div>

        {/* Attendance history table */}
        <div style={{ ...cardStyle, padding: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>출결 이력</h3>
          {attendanceHistory.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: 13 }}>출결 기록이 없습니다.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, color: '#94a3b8', fontSize: 12 }}>날짜</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, color: '#94a3b8', fontSize: 12 }}>출근</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, color: '#94a3b8', fontSize: 12 }}>퇴근</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, color: '#94a3b8', fontSize: 12 }}>상태</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500, color: '#94a3b8', fontSize: 12 }}>시간</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceHistory.map((record) => {
                    const statusColors: Record<string, { bg: string; color: string; label: string }> = {
                      present: { bg: '#d1fae5', color: '#047857', label: '출석' },
                      late: { bg: '#fef3c7', color: '#b45309', label: '지각' },
                      absent: { bg: '#fee2e2', color: '#dc2626', label: '결석' },
                      half_day: { bg: '#e0e7ff', color: '#4338ca', label: '반차' },
                    }
                    const st = statusColors[record.status] || statusColors.present
                    return (
                      <tr key={record.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 12px', color: '#334155' }}>
                          {new Date(record.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' })}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#64748b' }}>
                          {record.check_in ? new Date(record.check_in).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#64748b' }}>
                          {record.check_out ? new Date(record.check_out).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                            background: st.bg, color: st.color,
                          }}>
                            {st.label}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748b' }}>
                          {record.hours != null ? `${record.hours.toFixed(1)}h` : '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    )
  }
}
