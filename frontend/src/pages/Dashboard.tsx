import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useRole, isPrivileged, type Role } from '../contexts/RoleContext'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../api/client'
import ActiveResearchSection from '../components/ActiveResearchSection'

// ─── Types ───
type StudentRow = { name: string; type: string; project: string; dailyStatus: string; attendance: string }
type TaskRow = { title: string; project: string; status: '완료' | '진행중' | '미시작'; url: string; guide: string }
type IssueItem = { student: string; issue: string; time: string; urgent: boolean }
type MilestoneItem = { title: string; project: string; date: string; daysLeft: number }
type ScheduleItem = { time: string; title: string; type: string }

// ─── Shared Styles ───
const cardStyle: React.CSSProperties = {
  background: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
}

const sectionHeaderStyle: React.CSSProperties = {
  padding: '20px 28px',
  borderBottom: '1px solid #f1f5f9',
}

const sectionTitleStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: '17px',
  color: 'var(--color-text-primary)',
}

const sectionSubtitleStyle: React.CSSProperties = {
  fontSize: '13px',
  color: 'var(--color-text-muted)',
  marginTop: '4px',
}

const badgeStyle = (bg: string, color: string): React.CSSProperties => ({
  padding: '3px 10px',
  borderRadius: 99,
  fontSize: 11,
  fontWeight: 600,
  background: bg,
  color: color,
  whiteSpace: 'nowrap',
})

const hoverRow = {
  onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.background = '#f8fafc' },
  onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.background = 'transparent' },
}

// ─── Greeting subtitle map ───
const greetingSubtitleMap: Record<Role, string> = {
  admin: '시스템 전체 현황을 관리하세요.',
  professor: '지도학생 현황과 연구실 활동을 확인하세요.',
  student: '오늘의 태스크와 일정을 확인하세요.',
  external: '참여 프로젝트 현황을 확인하세요.',
}

// ─── Status helpers ───
const dailyStatusBadge = (status: string) => {
  if (status === '제출') return badgeStyle('var(--color-success-light)', 'var(--color-success)')
  return badgeStyle('var(--color-danger-light)', 'var(--color-danger)')
}

const attendanceBadge = (status: string) => {
  if (status === '출근') return badgeStyle('var(--color-accent-light)', 'var(--color-accent-dark)')
  if (status === '지각') return badgeStyle('var(--color-warning-light)', 'var(--color-warning)')
  return badgeStyle('var(--color-danger-light)', 'var(--color-danger)')
}

const taskStatusBadge = (status: '완료' | '진행중' | '미시작') => {
  if (status === '완료') return badgeStyle('var(--color-success-light)', 'var(--color-success)')
  if (status === '진행중') return badgeStyle('var(--color-accent-light)', 'var(--color-accent)')
  return badgeStyle('#f1f5f9', 'var(--color-text-muted)')
}

// ─── Helpers ───
function timeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 60) return `${diffMin}분 전`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}시간 전`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}일 전`
}

function daysUntil(dateStr: string): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
}

// ─── Main Component ───
export default function Dashboard() {
  const { currentRole } = useRole()
  const { user } = useAuth()
  const userName = user?.name || '사용자'

  return (
    <div key={currentRole} style={{ width: '100%' }}>
      {/* Greeting */}
      <div style={{ marginBottom: '32px' }} className="animate-fade-in">
        <h1 style={{ fontSize: '26px', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-display)' }}>
          안녕하세요, {userName}님
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '15px', marginTop: '6px', lineHeight: 1.5 }}>
          {greetingSubtitleMap[currentRole]}
        </p>
      </div>

      {/* Role-specific content */}
      {isPrivileged(currentRole) && <ProfessorView />}
      {currentRole === 'student' && <StudentView />}
      {currentRole === 'external' && <ExternalView />}

      <style>{`
        .dash-grid-2col {
          display: grid;
          grid-template-columns: 1fr;
          gap: 24px;
        }
        @media (min-width: 900px) {
          .dash-grid-2col { grid-template-columns: 2fr 1fr; }
        }
        .dash-grid-3stat {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        .dash-summary-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 20px;
          margin-bottom: 24px;
        }
        @media (min-width: 640px) {
          .dash-summary-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (min-width: 1100px) {
          .dash-summary-grid { grid-template-columns: repeat(3, 1fr); }
        }
      `}</style>
    </div>
  )
}

// ════════════════════════════════════════
// ─── Professor View ───
// ════════════════════════════════════════
function ProfessorView() {
  const navigate = useNavigate()
  const [students, setStudents] = useState<StudentRow[]>([])
  const [taskSummary, setTaskSummary] = useState({ done: 0, inProgress: 0, notStarted: 0 })
  const [issues, setIssues] = useState<IssueItem[]>([])
  const [milestones, setMilestones] = useState<MilestoneItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

    Promise.all([
      api.users.list({ role: 'student' }).catch(() => null),
      api.tasks.my().catch(() => null),
      api.daily.list({ date_from: today, date_to: today }).catch(() => null),
      api.attendance.students({ date: today }).catch(() => null),
      api.events.list({ date_from: today }).catch(() => null),
    ]).then(([apiStudents, apiTasks, apiDailyLogs, apiAttendance, apiEvents]) => {
      // Collect author IDs who submitted daily logs today
      const dailyLogEntries: any[] = (apiDailyLogs as any)?.data || []
      const submittedAuthorIds = new Set(dailyLogEntries.map((log: any) => log.author_id || log.author?.id))

      // Build attendance lookup: student_id -> status
      const attendanceList: any[] = (apiAttendance as any)?.data || []
      const attendanceMap = new Map<string, string>()
      for (const rec of attendanceList) {
        const sid = rec.user_id || rec.student_id || rec.id
        if (rec.check_in_time && rec.is_late) {
          attendanceMap.set(sid, '지각')
        } else if (rec.check_in_time) {
          attendanceMap.set(sid, '출근')
        }
      }

      // Extract issues from daily logs (blocks with section='issue')
      const issueItems: IssueItem[] = []
      for (const log of dailyLogEntries) {
        const blocks: any[] = log.blocks || []
        for (const block of blocks) {
          if (block.section === 'issue' || block.block_type === 'issue') {
            issueItems.push({
              student: log.author?.name || log.author_name || '학생',
              issue: block.content || block.text || '',
              time: timeAgo(log.created_at || log.date || today),
              urgent: block.urgent === true || block.priority === 'high',
            })
          }
        }
      }
      setIssues(issueItems)

      // Build milestones from events
      const eventItems: any[] = (apiEvents as any)?.data || []
      const milestoneItems: MilestoneItem[] = eventItems
        .filter((ev: any) => ev.date || ev.start_date || ev.end_date)
        .map((ev: any) => {
          const eventDate = ev.date || ev.start_date || ev.end_date || ''
          return {
            title: ev.title || ev.name || '',
            project: ev.project_name || ev.project?.name || '',
            date: eventDate,
            daysLeft: daysUntil(eventDate),
          }
        })
        .sort((a: MilestoneItem, b: MilestoneItem) => a.daysLeft - b.daysLeft)
        .slice(0, 5)
      setMilestones(milestoneItems)

      // Map students
      const rawStudents: any[] = (apiStudents as any)?.data || []
      setStudents(rawStudents.map((s: any) => ({
        name: s.name || '',
        type: '지도학생',
        project: s.major_field || '',
        dailyStatus: submittedAuthorIds.has(s.id) ? '제출' : '미제출',
        attendance: attendanceMap.get(s.id) || '미출근',
      })))

      // Map tasks
      const rawTasks: any[] = (apiTasks as any)?.data || []
      const done = rawTasks.filter((t: any) => t.status === 'done' || t.status === 'completed').length
      const inProgress = rawTasks.filter((t: any) => t.status === 'in_progress').length
      const notStarted = rawTasks.filter((t: any) => t.status === 'not_started' || t.status === 'new').length
      setTaskSummary({ done, inProgress, notStarted })
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: '48px', color: 'var(--color-text-muted)', textAlign: 'center' }}>로딩 중...</div>

  const submitted = students.filter(s => s.dailyStatus === '제출').length
  const notSubmitted = students.filter(s => s.dailyStatus === '미제출').length
  const attendPresent = students.filter(s => s.attendance === '출근').length
  const attendLate = students.filter(s => s.attendance === '지각').length
  const attendAbsent = students.filter(s => s.attendance === '미출근').length

  return (
    <div>
      {/* Summary Row */}
      <div className="dash-summary-grid opacity-0 animate-fade-in stagger-1">
        {/* Daily Submission Status */}
        <div style={{ ...cardStyle, padding: '24px' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 16 }}>
            오늘 데일리 제출 현황
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 36, fontWeight: 700, color: 'var(--color-accent)', lineHeight: 1 }}>{submitted}</span>
            <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>/ {students.length}명 제출</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={badgeStyle('var(--color-success-light)', 'var(--color-success)')}>제출 {submitted}</span>
            <span style={badgeStyle('var(--color-danger-light)', 'var(--color-danger)')}>미제출 {notSubmitted}</span>
          </div>
        </div>

        {/* Attendance Status */}
        <div style={{ ...cardStyle, padding: '24px' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 16 }}>
            학생 출결 현황
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 36, fontWeight: 700, color: 'var(--color-success)', lineHeight: 1 }}>{attendPresent + attendLate}</span>
            <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>/ {students.length}명 출근</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={badgeStyle('var(--color-accent-light)', 'var(--color-accent-dark)')}>출근 {attendPresent}</span>
            <span style={badgeStyle('var(--color-warning-light)', 'var(--color-warning)')}>지각 {attendLate}</span>
            <span style={badgeStyle('var(--color-danger-light)', 'var(--color-danger)')}>미출근 {attendAbsent}</span>
          </div>
        </div>

        {/* Task Summary */}
        <div style={{ ...cardStyle, padding: '24px' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 16 }}>
            이번 주 배정 태스크 현황
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 36, fontWeight: 700, color: 'var(--color-accent)', lineHeight: 1 }}>
              {taskSummary.done + taskSummary.inProgress + taskSummary.notStarted}
            </span>
            <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>건 전체</span>
          </div>
          <div className="dash-grid-3stat">
            <div style={{ textAlign: 'center', padding: '10px 0', borderRadius: 10, background: 'var(--color-success-light)' }}>
              <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-success)' }}>{taskSummary.done}</p>
              <p style={{ fontSize: 11, color: 'var(--color-success)', fontWeight: 500 }}>완료</p>
            </div>
            <div style={{ textAlign: 'center', padding: '10px 0', borderRadius: 10, background: 'var(--color-accent-light)' }}>
              <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-accent)' }}>{taskSummary.inProgress}</p>
              <p style={{ fontSize: 11, color: 'var(--color-accent)', fontWeight: 500 }}>진행중</p>
            </div>
            <div style={{ textAlign: 'center', padding: '10px 0', borderRadius: 10, background: '#f1f5f9' }}>
              <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-muted)' }}>{taskSummary.notStarted}</p>
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 500 }}>미시작</p>
            </div>
          </div>
        </div>
      </div>

      {/* 진행 중인 연구 (SOTA 통합) — 전체 */}
      <ActiveResearchSection scope="all" limit={12} />

      {/* Main grid: Students + Issues/Milestones */}
      <div className="dash-grid-2col">
        {/* Student List */}
        <div className="opacity-0 animate-fade-in stagger-2">
          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            <div style={{ ...sectionHeaderStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={sectionTitleStyle}>내 학생들</h3>
                <p style={sectionSubtitleStyle}>지도학생 + 프로젝트 학생 통합 ({students.length}명)</p>
              </div>
              <button
                onClick={() => navigate('/members')}
                style={{
                  fontSize: 14, fontWeight: 500, color: 'var(--color-accent)', background: 'none',
                  border: 'none', cursor: 'pointer', padding: '6px 12px', borderRadius: 8,
                }}
              >
                전체 보기
              </button>
            </div>
            <div>
              {students.map((student, idx) => (
                <div
                  key={student.name}
                  style={{
                    padding: '16px 28px',
                    borderBottom: idx < students.length - 1 ? '1px solid #f8fafc' : 'none',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  {...hoverRow}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: student.type === '지도학생'
                          ? 'linear-gradient(135deg, var(--color-accent), var(--color-accent-dark))'
                          : 'linear-gradient(135deg, var(--color-warning), #92400e)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{student.name.charAt(0)}</span>
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{student.name}</p>
                          <span style={{
                            fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 4,
                            background: student.type === '지도학생' ? 'var(--color-accent-light)' : 'var(--color-warning-light)',
                            color: student.type === '지도학생' ? 'var(--color-accent)' : 'var(--color-warning)',
                          }}>
                            {student.type}
                          </span>
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{student.project}</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={dailyStatusBadge(student.dailyStatus)}>데일리: {student.dailyStatus}</span>
                      <span style={attendanceBadge(student.attendance)}>{student.attendance}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column: Issues + Milestones */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Issues */}
          <div className="opacity-0 animate-fade-in stagger-3">
            <div style={{ ...cardStyle, overflow: 'hidden' }}>
              <div style={sectionHeaderStyle}>
                <h3 style={sectionTitleStyle}>최근 이슈</h3>
                <p style={sectionSubtitleStyle}>빠른 확인 필요</p>
              </div>
              <div style={{ padding: '12px' }}>
                {issues.length === 0 ? (
                  <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
                    보고된 이슈가 없습니다.
                  </div>
                ) : issues.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex', gap: 14, padding: '14px',
                      borderRadius: 12, transition: 'background 0.15s', cursor: 'pointer',
                    }}
                    {...hoverRow}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: item.urgent ? 'var(--color-danger-light)' : '#f1f5f9',
                    }}>
                      <svg style={{ width: 16, height: 16, color: item.urgent ? 'var(--color-danger)' : 'var(--color-text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.student}</span>
                        {item.urgent && (
                          <span style={badgeStyle('var(--color-danger-light)', 'var(--color-danger)')}>긴급</span>
                        )}
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{item.issue}</p>
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4, display: 'block' }}>{item.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Milestones */}
          <div className="opacity-0 animate-fade-in stagger-4">
            <div style={{ ...cardStyle, overflow: 'hidden' }}>
              <div style={sectionHeaderStyle}>
                <h3 style={sectionTitleStyle}>다가오는 마일스톤</h3>
                <p style={sectionSubtitleStyle}>일정 관리</p>
              </div>
              <div style={{ padding: '12px' }}>
                {milestones.length === 0 ? (
                  <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
                    예정된 마일스톤이 없습니다.
                  </div>
                ) : milestones.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px', borderRadius: 12, transition: 'background 0.15s', cursor: 'pointer',
                      gap: 12,
                    }}
                    {...hoverRow}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.title}</p>
                      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{item.project}</p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, fontFamily: 'monospace', color: 'var(--color-text-secondary)' }}>{item.date}</p>
                      <span style={{
                        fontSize: 11, fontWeight: 600,
                        color: item.daysLeft <= 7 ? 'var(--color-danger)' : 'var(--color-text-muted)',
                      }}>
                        D-{item.daysLeft}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════
// ─── Student View ───
// ════════════════════════════════════════
function StudentView() {
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [weeklyProgress, setWeeklyProgress] = useState({ done: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [schedule, setSchedule] = useState<ScheduleItem[]>([])
  const [attendanceStatus, setAttendanceStatus] = useState<{
    checkedIn: boolean; checkedOut: boolean; checkInTime: string | null
  }>({ checkedIn: false, checkedOut: false, checkInTime: null })
  const [dailyWritten, setDailyWritten] = useState(false)
  const [attendanceLoading, setAttendanceLoading] = useState(false)

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)

    Promise.all([
      api.tasks.my().catch(() => null),
      api.events.list({ date_from: today, date_to: today }).catch(() => null),
      api.attendance.today().catch(() => null),
      api.daily.list({ date_from: today, date_to: today }).catch(() => null),
    ]).then(([apiTasks, apiEvents, apiAttendance, apiDailyLogs]) => {
      // Tasks
      const items: any[] = (apiTasks as any)?.data || []
      const statusMap: Record<string, '완료' | '진행중' | '미시작'> = {
        done: '완료', completed: '완료',
        in_progress: '진행중',
        not_started: '미시작', new: '미시작',
      }
      const mapped: TaskRow[] = items.map((t: any) => ({
        title: t.title || '',
        project: '',
        status: statusMap[t.status] || '미시작',
        url: '',
        guide: t.description || '',
      }))
      setTasks(mapped)
      const done = mapped.filter(t => t.status === '완료').length
      setWeeklyProgress({ done, total: mapped.length })

      // Schedule from events
      const eventItems: any[] = (apiEvents as any)?.data || []
      const scheduleItems: ScheduleItem[] = eventItems.map((ev: any) => {
        const startTime = ev.start_time || ev.time || ''
        // Extract HH:MM from datetime or time string
        let displayTime = ''
        if (startTime) {
          const timePart = startTime.includes('T') ? startTime.split('T')[1] : startTime
          displayTime = timePart.slice(0, 5)
        }
        return {
          time: displayTime,
          title: ev.title || ev.name || '',
          type: ev.event_type || ev.type || ev.category || '',
        }
      }).sort((a: ScheduleItem, b: ScheduleItem) => a.time.localeCompare(b.time))
      setSchedule(scheduleItems)

      // Attendance today
      const attData = apiAttendance as any
      if (attData) {
        const checkIn = attData.check_in_time || attData.check_in || null
        const checkOut = attData.check_out_time || attData.check_out || null
        let checkInDisplay: string | null = null
        if (checkIn) {
          const timePart = typeof checkIn === 'string' && checkIn.includes('T')
            ? checkIn.split('T')[1] : checkIn
          checkInDisplay = typeof timePart === 'string' ? timePart.slice(0, 5) : checkIn
        }
        setAttendanceStatus({
          checkedIn: !!checkIn,
          checkedOut: !!checkOut,
          checkInTime: checkInDisplay,
        })
      }

      // Daily log check
      const dailyEntries: any[] = (apiDailyLogs as any)?.data || []
      setDailyWritten(dailyEntries.length > 0)
    }).catch(() => {
      setTasks([])
      setWeeklyProgress({ done: 0, total: 0 })
    }).finally(() => setLoading(false))
  }, [])

  const handleCheckIn = useCallback(async () => {
    setAttendanceLoading(true)
    try {
      const res = await api.attendance.checkIn() as any
      const checkIn = res?.check_in_time || res?.check_in || new Date().toISOString()
      const timePart = typeof checkIn === 'string' && checkIn.includes('T')
        ? checkIn.split('T')[1] : checkIn
      const checkInDisplay = typeof timePart === 'string' ? timePart.slice(0, 5) : checkIn
      setAttendanceStatus({ checkedIn: true, checkedOut: false, checkInTime: checkInDisplay })
    } catch {
      // silently fail — API might not be ready
    } finally {
      setAttendanceLoading(false)
    }
  }, [])

  const handleCheckOut = useCallback(async () => {
    setAttendanceLoading(true)
    try {
      await api.attendance.checkOut()
      setAttendanceStatus(prev => ({ ...prev, checkedOut: true }))
    } catch {
      // silently fail
    } finally {
      setAttendanceLoading(false)
    }
  }, [])

  if (loading) return <div style={{ padding: '48px', color: 'var(--color-text-muted)', textAlign: 'center' }}>로딩 중...</div>

  const progressPct = weeklyProgress.total > 0
    ? Math.round((weeklyProgress.done / weeklyProgress.total) * 100)
    : 0

  // Determine attendance display text
  let attendanceText = '아직 출근 전'
  if (attendanceStatus.checkedIn && attendanceStatus.checkedOut) {
    attendanceText = `오늘 출근: ${attendanceStatus.checkInTime} | 퇴근 완료`
  } else if (attendanceStatus.checkedIn) {
    attendanceText = `오늘 출근: ${attendanceStatus.checkInTime} | 근무중`
  }

  return (
    <div>
      {/* Top row: Attendance + Daily shortcut + Weekly progress */}
      <div className="dash-summary-grid opacity-0 animate-fade-in stagger-1">
        {/* Attendance */}
        <div style={{
          ...cardStyle, padding: '24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
        }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>출석 체크</h3>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{attendanceText}</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {!attendanceStatus.checkedIn ? (
              <button
                onClick={handleCheckIn}
                disabled={attendanceLoading}
                style={{
                  padding: '10px 22px', borderRadius: 12, fontSize: 13, fontWeight: 600,
                  border: 'none', cursor: attendanceLoading ? 'not-allowed' : 'pointer',
                  background: 'var(--color-accent)', color: '#fff',
                  boxShadow: '0 2px 8px rgba(79,70,229,0.3)',
                  opacity: attendanceLoading ? 0.6 : 1,
                }}
              >
                {attendanceLoading ? '처리중...' : '출근하기'}
              </button>
            ) : (
              <button style={{
                padding: '10px 22px', borderRadius: 12, fontSize: 13, fontWeight: 600,
                border: 'none', cursor: 'not-allowed',
                background: '#f1f5f9', color: 'var(--color-text-muted)',
              }}>
                출근 완료
              </button>
            )}
            {attendanceStatus.checkedIn && !attendanceStatus.checkedOut ? (
              <button
                onClick={handleCheckOut}
                disabled={attendanceLoading}
                style={{
                  padding: '10px 22px', borderRadius: 12, fontSize: 13, fontWeight: 600,
                  border: 'none', cursor: attendanceLoading ? 'not-allowed' : 'pointer',
                  background: 'var(--color-danger)', color: '#fff',
                  boxShadow: '0 2px 8px rgba(220,38,38,0.3)',
                  opacity: attendanceLoading ? 0.6 : 1,
                }}
              >
                {attendanceLoading ? '처리중...' : '퇴근하기'}
              </button>
            ) : attendanceStatus.checkedOut ? (
              <button style={{
                padding: '10px 22px', borderRadius: 12, fontSize: 13, fontWeight: 600,
                border: 'none', cursor: 'not-allowed',
                background: '#f1f5f9', color: 'var(--color-text-muted)',
              }}>
                퇴근 완료
              </button>
            ) : null}
          </div>
        </div>

        {/* Daily shortcut */}
        <div style={{
          ...cardStyle, padding: '24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
        }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>데일리 작성</h3>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              {dailyWritten ? '오늘 데일리 제출 완료' : '오늘 아직 미작성'}
            </p>
          </div>
          <Link to="/daily/write" style={{
            padding: '10px 22px', borderRadius: 12, fontSize: 13, fontWeight: 600,
            border: 'none', cursor: 'pointer', textDecoration: 'none',
            background: dailyWritten ? '#f1f5f9' : 'var(--color-accent)',
            color: dailyWritten ? 'var(--color-text-muted)' : '#fff',
            boxShadow: dailyWritten ? 'none' : '0 2px 8px rgba(79,70,229,0.3)',
          }}>
            {dailyWritten ? '수정하기' : '작성하기'}
          </Link>
        </div>

        {/* Weekly progress */}
        <div style={{ ...cardStyle, padding: '24px' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 12 }}>이번 주 진행률</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 36, fontWeight: 700, color: 'var(--color-accent)', lineHeight: 1 }}>{progressPct}%</span>
            <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{weeklyProgress.done}/{weeklyProgress.total}건 완료</span>
          </div>
          <div style={{ height: 8, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: 'var(--color-accent)', borderRadius: 99,
              width: `${progressPct}%`, transition: 'width 0.7s ease',
            }} />
          </div>
        </div>
      </div>

      {/* 내 진행 중인 연구 (SOTA 통합 — 본인 배정) */}
      <ActiveResearchSection scope="mine" limit={12} />

      {/* Main grid: Tasks + Schedule */}
      <div className="dash-grid-2col">
        {/* Task list with details */}
        <div className="opacity-0 animate-fade-in stagger-2">
          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            <div style={{ ...sectionHeaderStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={sectionTitleStyle}>오늘 배정된 태스크</h3>
                <p style={sectionSubtitleStyle}>
                  {tasks.filter(t => t.status !== '완료').length}건 진행중 / {tasks.length}건 전체
                </p>
              </div>
            </div>
            <div>
              {tasks.map((task, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '20px 28px',
                    borderBottom: idx < tasks.length - 1 ? '1px solid #f1f5f9' : 'none',
                    opacity: task.status === '완료' ? 0.55 : 1,
                    transition: 'background 0.15s',
                  }}
                  {...hoverRow}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: task.url || task.guide ? 10 : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: 6, marginTop: 1, flexShrink: 0,
                        border: task.status === '완료' ? 'none' : '2px solid var(--color-border)',
                        background: task.status === '완료' ? 'var(--color-success)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {task.status === '완료' && (
                          <svg style={{ width: 12, height: 12, color: '#fff' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)',
                          textDecoration: task.status === '완료' ? 'line-through' : 'none',
                        }}>
                          {task.title}
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{task.project}</p>
                      </div>
                    </div>
                    <span style={taskStatusBadge(task.status)}>{task.status}</span>
                  </div>

                  {/* Task details: URL + guide */}
                  {(task.url || task.guide) && (
                    <div style={{
                      marginLeft: 34,
                      padding: '10px 14px',
                      borderRadius: 10,
                      background: '#f8fafc',
                      borderLeft: '3px solid var(--color-accent-light)',
                    }}>
                      {task.url && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: task.guide ? 6 : 0 }}>
                          <svg style={{ width: 12, height: 12, color: 'var(--color-accent)', flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                          <a
                            href={task.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: 12, color: 'var(--color-accent)', textDecoration: 'none', wordBreak: 'break-all' }}
                          >
                            {task.url}
                          </a>
                        </div>
                      )}
                      {task.guide && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                          <svg style={{ width: 12, height: 12, color: 'var(--color-text-muted)', flexShrink: 0, marginTop: 2 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                          </svg>
                          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{task.guide}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column: Schedule */}
        <div className="opacity-0 animate-fade-in stagger-3">
          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            <div style={sectionHeaderStyle}>
              <h3 style={sectionTitleStyle}>오늘 일정</h3>
              <p style={sectionSubtitleStyle}>{schedule.length}건</p>
            </div>
            <div style={{ padding: 12 }}>
              {schedule.length === 0 ? (
                <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
                  오늘 예정된 일정이 없습니다.
                </div>
              ) : schedule.map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex', gap: 14, padding: '14px',
                    borderRadius: 10, transition: 'background 0.15s',
                  }}
                  {...hoverRow}
                >
                  <span style={{
                    fontSize: 13, fontWeight: 600, color: 'var(--color-accent)',
                    minWidth: 48, fontFamily: 'monospace',
                  }}>
                    {item.time}
                  </span>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>{item.title}</p>
                    {item.type && (
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 6,
                        background: '#f1f5f9', color: 'var(--color-text-muted)', fontWeight: 500,
                        display: 'inline-block', marginTop: 4,
                      }}>
                        {item.type}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════
// ─── External View ───
// ════════════════════════════════════════
function ExternalView() {
  const [projects, setProjects] = useState<any[]>([])
  const [projectTasks, setProjectTasks] = useState<Record<string, any[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.projects.list()
      .then(async (res: any) => {
        const items: any[] = res?.data || []
        setProjects(items)

        // Fetch tasks for each project
        const tasksByProject: Record<string, any[]> = {}
        await Promise.all(
          items.map(async (project: any) => {
            if (!project.id) return
            try {
              const taskRes = await api.tasks.listByProject(project.id) as any
              tasksByProject[project.id] = taskRes?.data || []
            } catch {
              tasksByProject[project.id] = []
            }
          })
        )
        setProjectTasks(tasksByProject)
      })
      .catch(() => setProjects([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: '48px', color: 'var(--color-text-muted)', textAlign: 'center' }}>로딩 중...</div>

  if (projects.length === 0) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
        참여 중인 프로젝트가 없습니다.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* 내 진행 중인 연구 (모터헤드 입장 — 본인 배정만) */}
      <ActiveResearchSection scope="mine" limit={12} />

      {projects.map((project: any, pi: number) => (
        <div key={project.id || pi} className={`opacity-0 animate-fade-in stagger-${pi + 1}`}>
          <div style={{ ...cardStyle, overflow: 'hidden' }}>
            {/* Project header */}
            <div style={{
              ...sectionHeaderStyle,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <h3 style={sectionTitleStyle}>{project.name}</h3>
                <p style={{ ...sectionSubtitleStyle, fontFamily: 'monospace' }}>{project.status}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{
                  display: 'inline-block', padding: '4px 14px', borderRadius: 99,
                  fontSize: 13, fontWeight: 600,
                  background: 'var(--color-accent-light)', color: 'var(--color-accent)',
                }}>
                  {project.status}
                </span>
              </div>
            </div>

            {/* Info section */}
            <div style={{ padding: '20px 28px' }}>
              {project.description ? (
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  {project.description}
                </p>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>프로젝트 설명 없음</p>
              )}
              {project.end_date && (
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8 }}>
                  마감일: {project.end_date}
                </p>
              )}
            </div>

            {/* Tasks section */}
            <div style={{ padding: '16px 28px 20px', borderTop: '1px solid #f1f5f9' }}>
              {(() => {
                const tasks = projectTasks[project.id] || []
                if (tasks.length === 0) {
                  return (
                    <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                      등록된 태스크가 없습니다.
                    </p>
                  )
                }
                const done = tasks.filter((t: any) => t.status === 'done' || t.status === 'completed').length
                const inProgress = tasks.filter((t: any) => t.status === 'in_progress').length
                const notStarted = tasks.length - done - inProgress
                return (
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
                      태스크 현황 ({tasks.length}건)
                    </p>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                      <span style={badgeStyle('var(--color-success-light)', 'var(--color-success)')}>완료 {done}</span>
                      <span style={badgeStyle('var(--color-accent-light)', 'var(--color-accent)')}>진행중 {inProgress}</span>
                      <span style={badgeStyle('#f1f5f9', 'var(--color-text-muted)')}>미시작 {notStarted}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {tasks.slice(0, 5).map((t: any, ti: number) => {
                        const statusMap: Record<string, string> = {
                          done: '완료', completed: '완료', in_progress: '진행중', not_started: '미시작', new: '미시작',
                        }
                        const status = statusMap[t.status] || '미시작'
                        return (
                          <div key={t.id || ti} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '8px 12px', borderRadius: 8, background: '#f8fafc',
                          }}>
                            <span style={{
                              fontSize: 13, color: 'var(--color-text-primary)',
                              textDecoration: status === '완료' ? 'line-through' : 'none',
                              opacity: status === '완료' ? 0.6 : 1,
                            }}>
                              {t.title}
                            </span>
                            <span style={taskStatusBadge(status as '완료' | '진행중' | '미시작')}>{status}</span>
                          </div>
                        )
                      })}
                      {tasks.length > 5 && (
                        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 4 }}>
                          외 {tasks.length - 5}건 더...
                        </p>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      ))}

    </div>
  )
}
