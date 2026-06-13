import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'

// ── Types ──────────────────────────────────────────────────

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

type FilterTab = 'all' | 'unread' | 'read'

// ── Constants ──────────────────────────────────────────────

const NOTIFICATION_TYPE_ICONS: Record<string, string> = {
  task_assigned: '\u{1F4CB}',
  task_updated: '\u{1F504}',
  daily_comment: '\u{1F4AC}',
  daily_issue: '\u{26A0}\u{FE0F}',
  attendance_missing: '\u{23F0}',
  event_reminder: '\u{1F4C5}',
  report_published: '\u{1F4CA}',
  sota_assigned: '\u{1F4D6}',
  model_comment: '\u{1F4AC}',
  model_confirm: '\u{2705}',
  sota_review: '\u{1F4DD}',
}

const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  task_assigned: '태스크 배정',
  task_updated: '태스크 변경',
  daily_comment: '댓글',
  daily_issue: '이슈',
  attendance_missing: '출결 미달',
  event_reminder: '일정 알림',
  report_published: '보고서 발행',
  sota_assigned: 'SOTA 배정',
  model_comment: '모델 댓글',
  model_confirm: '연구 컨펌',
  sota_review: '리뷰 제출',
}

const cardStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
}

// ── Helpers ────────────────────────────────────────────────

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
  if (days === 1) return '어제'
  if (days < 7) return `${days}일 전`
  return new Date(dateStr).toLocaleDateString('ko-KR')
}

// ── Component ──────────────────────────────────────────────

export default function Notifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [filter, setFilter] = useState<FilterTab>('all')
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(0)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const PAGE_SIZE = 20

  // ── Fetch notifications ──────────────────────────────────

  const fetchNotifications = useCallback(async (pageNum: number, append = false) => {
    if (pageNum === 0) setLoading(true)
    else setLoadingMore(true)

    try {
      const params: Record<string, string> = {
        limit: String(PAGE_SIZE),
        offset: String(pageNum * PAGE_SIZE),
      }
      if (filter === 'unread') params.is_read = 'false'
      if (filter === 'read') params.is_read = 'true'

      const [listRes, countRes] = await Promise.all([
        api.notifications.list(params) as Promise<any>,
        api.notifications.unreadCount() as Promise<any>,
      ])

      const items: NotificationItem[] = listRes?.data || []
      setUnreadCount(countRes?.unread_count ?? listRes?.unread_count ?? 0)

      if (append) {
        setNotifications((prev) => [...prev, ...items])
      } else {
        setNotifications(items)
      }
      setHasMore(items.length >= PAGE_SIZE)
      setPage(pageNum)
    } catch {
      if (!append) setNotifications([])
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [filter])

  useEffect(() => {
    fetchNotifications(0)
  }, [fetchNotifications])

  // ── Actions ──────────────────────────────────────────────

  const handleMarkRead = useCallback(async (id: string) => {
    try {
      await api.notifications.markRead(id)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch { /* ignore */ }
  }, [])

  const handleMarkAllRead = useCallback(async () => {
    try {
      await api.notifications.markAllRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch { /* ignore */ }
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id)
    try {
      await api.notifications.delete(id)
      const deleted = notifications.find((n) => n.id === id)
      setNotifications((prev) => prev.filter((n) => n.id !== id))
      if (deleted && !deleted.is_read) {
        setUnreadCount((prev) => Math.max(0, prev - 1))
      }
    } catch { /* ignore */ }
    finally { setDeletingId(null) }
  }, [notifications])

  const handleLoadMore = useCallback(() => {
    fetchNotifications(page + 1, true)
  }, [fetchNotifications, page])

  // ── Filter tabs ──────────────────────────────────────────

  const filterTabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: '전체' },
    { key: 'unread', label: '읽지 않음' },
    { key: 'read', label: '읽음' },
  ]

  // ── Render ──────────────────────────────────────────────

  return (
    <div style={{ width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: 26, fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-display)' }}>
            알림
          </h1>
          {unreadCount > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              minWidth: 24, height: 24, borderRadius: 99,
              background: '#4f46e5', color: '#fff',
              fontSize: 12, fontWeight: 700, padding: '0 7px',
            }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            style={{
              padding: '8px 18px', borderRadius: 10,
              background: '#4f46e5', color: '#fff',
              fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#4338ca' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#4f46e5' }}
          >
            모두 읽음
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 20,
        padding: 4, borderRadius: 12,
        background: '#f1f5f9',
      }}>
        {filterTabs.map((tab) => {
          const active = filter === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 8,
                fontSize: 13, fontWeight: 500,
                border: 'none', cursor: 'pointer',
                background: active ? '#fff' : 'transparent',
                color: active ? '#0f172a' : '#64748b',
                boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
              {tab.key === 'unread' && unreadCount > 0 && (
                <span style={{
                  marginLeft: 6, padding: '1px 6px', borderRadius: 99,
                  fontSize: 10, fontWeight: 600,
                  background: active ? '#4f46e5' : '#94a3b8',
                  color: '#fff',
                }}>
                  {unreadCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Notification List */}
      <div style={cardStyle}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div style={{
              display: 'inline-block', width: 24, height: 24,
              border: '2.5px solid #e2e8f0', borderTopColor: '#4f46e5',
              borderRadius: '50%', animation: 'spin 0.8s linear infinite',
            }} />
            <p style={{ marginTop: 12, fontSize: 14, color: '#94a3b8' }}>로딩 중...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        ) : notifications.length === 0 ? (
          <div style={{ padding: 80, textAlign: 'center' }}>
            <svg style={{ width: 48, height: 48, margin: '0 auto 16px', color: '#cbd5e1' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <p style={{ fontSize: 15, color: '#94a3b8', fontWeight: 500 }}>
              {filter === 'unread' ? '읽지 않은 알림이 없습니다' : filter === 'read' ? '읽은 알림이 없습니다' : '새로운 알림이 없습니다'}
            </p>
            <p style={{ fontSize: 13, color: '#cbd5e1', marginTop: 6 }}>
              알림이 생기면 여기에 표시됩니다
            </p>
          </div>
        ) : (
          <div>
            {notifications.map((n, i) => {
              const isHovered = hoveredId === n.id
              const isDeleting = deletingId === n.id

              return (
                <div
                  key={n.id}
                  onClick={() => { if (!n.is_read) handleMarkRead(n.id) }}
                  onMouseEnter={() => setHoveredId(n.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 14,
                    padding: '16px 20px',
                    borderLeft: n.is_read ? '3px solid transparent' : '3px solid #4f46e5',
                    background: n.is_read
                      ? (isHovered ? '#fafafa' : '#fff')
                      : (isHovered ? '#dbeafe' : '#eff6ff'),
                    cursor: n.is_read ? 'default' : 'pointer',
                    borderBottom: i < notifications.length - 1 ? '1px solid #f1f5f9' : 'none',
                    transition: 'background 0.15s',
                    opacity: isDeleting ? 0.5 : 1,
                    position: 'relative',
                  }}
                >
                  {/* Type icon */}
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: n.is_read ? '#f1f5f9' : '#e0e7ff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, fontSize: 18,
                  }}>
                    {NOTIFICATION_TYPE_ICONS[n.notification_type] || '\u{1F514}'}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{
                        fontSize: 14, fontWeight: n.is_read ? 400 : 600,
                        color: '#0f172a', lineHeight: 1.4,
                      }}>
                        {n.title}
                      </span>
                      {!n.is_read && (
                        <span style={{
                          width: 7, height: 7, borderRadius: '50%',
                          background: '#4f46e5', flexShrink: 0,
                        }} />
                      )}
                    </div>
                    {n.body && (
                      <p style={{
                        fontSize: 13, color: '#64748b', lineHeight: 1.5,
                        marginBottom: 6,
                      }}>
                        {n.body}
                      </p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>
                        {timeAgo(n.created_at)}
                      </span>
                      <span style={{
                        padding: '1px 7px', borderRadius: 6,
                        fontSize: 10, fontWeight: 500,
                        background: '#f1f5f9', color: '#64748b',
                      }}>
                        {NOTIFICATION_TYPE_LABELS[n.notification_type] || n.notification_type}
                      </span>
                    </div>
                  </div>

                  {/* Delete button (hover only) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(n.id)
                    }}
                    disabled={isDeleting}
                    style={{
                      padding: 6, borderRadius: 6,
                      background: 'none', border: 'none',
                      cursor: isDeleting ? 'not-allowed' : 'pointer',
                      color: '#94a3b8',
                      opacity: isHovered ? 1 : 0,
                      transition: 'opacity 0.15s, color 0.15s',
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8' }}
                    title="삭제"
                  >
                    <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              )
            })}

            {/* Load More */}
            {hasMore && (
              <div style={{ padding: '16px 20px', textAlign: 'center', borderTop: '1px solid #f1f5f9' }}>
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  style={{
                    padding: '8px 28px', borderRadius: 8,
                    background: 'none', border: '1px solid #e2e8f0',
                    fontSize: 13, fontWeight: 500, color: '#475569',
                    cursor: loadingMore ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => { if (!loadingMore) (e.currentTarget as HTMLButtonElement).style.background = '#f8fafc' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                >
                  {loadingMore ? '로딩 중...' : '더 보기'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
