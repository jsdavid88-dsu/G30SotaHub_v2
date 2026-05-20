// 프로젝트 활동 피드 — Phase 1B (2026-05-20).
// GET /api/v1/projects/{id}/activity → 시간순 events
// type 별 아이콘/색상으로 한 줄씩
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

type ActivityEvent = {
  type: string
  actor_name: string
  actor_id: string | null
  summary: string
  target_type: string | null
  target_id: string | null
  timestamp: string
}

const TYPE_META: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  member_joined:   { icon: '👋', color: '#15803d', bg: '#f0fdf4', label: '합류' },
  task_created:    { icon: '📋', color: '#4338ca', bg: '#e0e7ff', label: '태스크' },
  task_completed:  { icon: '✓',  color: '#047857', bg: '#d1fae5', label: '완료' },
  daily_block:     { icon: '📝', color: '#0891b2', bg: '#ecfeff', label: '데일리' },
  announcement:    { icon: '📢', color: '#b45309', bg: '#fef3c7', label: '공지' },
  sota_assigned:   { icon: '🎯', color: '#7c3aed', bg: '#faf5ff', label: '배정' },
  sota_review:     { icon: '💭', color: '#1d4ed8', bg: '#dbeafe', label: '리뷰' },
}

function relativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60_000)
    if (m < 1) return '방금'
    if (m < 60) return `${m}분 전`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}시간 전`
    const d = Math.floor(h / 24)
    if (d < 7) return `${d}일 전`
    if (d < 30) return `${Math.floor(d / 7)}주 전`
    return new Date(iso).toLocaleDateString('ko-KR')
  } catch {
    return ''
  }
}

function eventLink(event: ActivityEvent): string | null {
  if (event.target_type === 'item' && event.target_id) return `/vfx/item/${event.target_id}`
  if (event.target_type === 'task' && event.target_id) return null  // task page X — 현재 inline
  if (event.target_type === 'daily_block') return '/daily/feed'
  if (event.target_type === 'announcement') return '/announcements'
  return null
}

export default function ProjectActivityFeed({ projectId }: { projectId: string }) {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const token = localStorage.getItem('token')
    fetch(`/api/v1/projects/${projectId}/activity?limit=50`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : [])
      .then((data) => { if (!cancelled) setEvents(Array.isArray(data) ? data : []) })
      .catch(() => { if (!cancelled) setEvents([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [projectId])

  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16,
      boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
      marginBottom: 24, overflow: 'hidden',
    }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%', padding: '16px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>📰</span>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>팀 활동</span>
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>
            {loading ? '로딩 중...' : `${events.length}건 (최근 50)`}
          </span>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div style={{ padding: '0 24px 16px' }}>
          {loading ? (
            <p style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              로딩 중...
            </p>
          ) : events.length === 0 ? (
            <p style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              아직 활동 기록이 없습니다. 멤버 추가 / 태스크 생성 / SOTA 배정 / 데일리(visibility=project) 가 여기 표시됩니다.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {events.map((e, i) => {
                const meta = TYPE_META[e.type] || { icon: '•', color: '#64748b', bg: '#f1f5f9', label: e.type }
                const link = eventLink(e)
                const inner = (
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '10px 8px', borderRadius: 8, transition: 'background 0.1s',
                  }}
                    onMouseEnter={(ev) => { (ev.currentTarget as HTMLDivElement).style.background = '#f8fafc' }}
                    onMouseLeave={(ev) => { (ev.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                  >
                    <span style={{
                      flexShrink: 0,
                      width: 28, height: 28, borderRadius: 6,
                      background: meta.bg, color: meta.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 600,
                    }}>{meta.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, color: '#0f172a', lineHeight: 1.5,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {e.summary}
                      </p>
                      <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                        {relativeTime(e.timestamp)} · <span style={{ color: meta.color, fontWeight: 600 }}>{meta.label}</span>
                      </p>
                    </div>
                  </div>
                )
                return (
                  <li key={i} style={{ borderBottom: i === events.length - 1 ? 'none' : '1px solid #f8fafc' }}>
                    {link ? (
                      <Link to={link} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                        {inner}
                      </Link>
                    ) : inner}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
