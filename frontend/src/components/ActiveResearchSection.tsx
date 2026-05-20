// Hub 대시보드의 "진행 중인 연구" 섹션.
// status='triaged' (분류 완료 / 진행 중) 인 모델을 카드 grid 로 표시.
// scope='all' = 전체 (교수/admin/external)
// scope='mine' = 내 user id 가 assignment 에 있는 것만 (student/external 본인 시점)
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchItems } from '../vfx/api/items'
import type { Item } from '../vfx/types'
import { useAuth } from '../contexts/AuthContext'

const cardStyle: React.CSSProperties = {
  background: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
}

const LIFECYCLE_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  research:   { bg: '#f1f5f9', color: '#475569', label: '연구' },
  dev:        { bg: '#dbeafe', color: '#1d4ed8', label: '개발' },
  testing:    { bg: '#fef3c7', color: '#b45309', label: '테스트' },
  production: { bg: '#d1fae5', color: '#047857', label: '운영' },
  deprecated: { bg: '#fee2e2', color: '#dc2626', label: '폐기' },
}

const ASSIGN_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  recommended: { bg: '#f0fdf4', color: '#15803d', label: '추천' },
  assigned:    { bg: '#e0e7ff', color: '#4338ca', label: '배정됨' },
  in_review:   { bg: '#fef3c7', color: '#b45309', label: '리뷰중' },
  submitted:   { bg: '#dbeafe', color: '#1d4ed8', label: '제출완료' },
  approved:    { bg: '#d1fae5', color: '#047857', label: '승인' },
  rejected:    { bg: '#fee2e2', color: '#dc2626', label: '반려' },
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const days = Math.floor(diff / 86400_000)
    if (days <= 0) return '오늘'
    if (days === 1) return '어제'
    if (days < 7) return `${days}일 전`
    if (days < 30) return `${Math.floor(days / 7)}주 전`
    if (days < 365) return `${Math.floor(days / 30)}개월 전`
    return `${Math.floor(days / 365)}년 전`
  } catch {
    return ''
  }
}

function ResearchCard({ item }: { item: Item }) {
  const [hover, setHover] = useState(false)
  const lifecycle = item.lifecycle_status ? LIFECYCLE_BADGE[item.lifecycle_status] : null
  const assignments = item.assignments ?? []
  const active = assignments.find((a) => a.status !== 'approved' && a.status !== 'rejected') ?? assignments[0]
  const stBadge = active ? ASSIGN_BADGE[active.status] : null

  // 가장 최근 리뷰 한 줄
  let lastReviewLine: string | null = null
  let lastReviewWhen: string | null = null
  if (active && active.reviews && active.reviews.length > 0) {
    const sorted = [...active.reviews].sort((x, y) => {
      const tx = x.submitted_at ? new Date(x.submitted_at).getTime() : 0
      const ty = y.submitted_at ? new Date(y.submitted_at).getTime() : 0
      return ty - tx
    })
    lastReviewLine = sorted[0].content?.split('\n')[0]?.slice(0, 80) ?? null
    lastReviewWhen = sorted[0].submitted_at
  }

  return (
    <Link
      to={`/vfx/item/${item.id}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...cardStyle,
        padding: 16,
        textDecoration: 'none',
        display: 'flex', flexDirection: 'column', gap: 8,
        border: `1px solid ${hover ? 'var(--color-accent)' : 'var(--color-border)'}`,
        boxShadow: hover ? '0 4px 12px rgba(79,70,229,0.10)' : '0 1px 2px rgba(0,0,0,0.02)',
        transform: hover ? 'translateY(-1px)' : 'none',
        transition: 'all 0.15s',
      }}
    >
      {/* Badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {lifecycle && (
          <span style={{
            padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600,
            background: lifecycle.bg, color: lifecycle.color,
          }}>{lifecycle.label}</span>
        )}
        {item.source && (
          <span style={{ padding: '2px 7px', borderRadius: 5, fontSize: 11, color: '#64748b', background: '#f1f5f9' }}>
            {item.source}
          </span>
        )}
        {item.priority && (item.priority === 'P0' || item.priority === 'P1') && (
          <span style={{
            padding: '2px 7px', borderRadius: 5, fontSize: 11, fontWeight: 600,
            background: item.priority === 'P0' ? '#fee2e2' : '#fef3c7',
            color: item.priority === 'P0' ? '#dc2626' : '#b45309',
          }}>{item.priority}</span>
        )}
      </div>

      {/* Title */}
      <h4 style={{
        fontSize: 14, fontWeight: 600,
        color: hover ? 'var(--color-accent)' : 'var(--color-text-primary)',
        lineHeight: 1.4,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        transition: 'color 0.15s',
      }}>
        {item.title}
      </h4>

      {/* Categories */}
      {item.category_slugs.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {item.category_slugs.slice(0, 3).map((slug) => (
            <span key={slug} style={{ fontSize: 10, color: 'var(--color-text-muted)', padding: '1px 5px', borderRadius: 4, background: '#fafbff' }}>
              #{slug}
            </span>
          ))}
        </div>
      )}

      {/* Assignment */}
      {active && (
        <div style={{
          marginTop: 'auto',
          paddingTop: 8, borderTop: '1px solid #f1f5f9',
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
        }}>
          <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            {active.assignee_name || '—'}
          </span>
          {stBadge && (
            <span style={{
              padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
              background: stBadge.bg, color: stBadge.color,
            }}>{stBadge.label}</span>
          )}
          {assignments.length > 1 && (
            <span style={{ color: 'var(--color-text-muted)', fontSize: 10 }}>+{assignments.length - 1}</span>
          )}
        </div>
      )}

      {/* Last review */}
      {lastReviewLine && (
        <div style={{
          padding: '6px 8px', borderRadius: 6,
          background: '#f8fafc', border: '1px solid #f1f5f9',
          fontSize: 11, color: 'var(--color-text-secondary)',
          lineHeight: 1.4,
        }}>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 10, fontWeight: 600 }}>
            {relativeTime(lastReviewWhen)} 메모
          </span>
          <div style={{
            marginTop: 2,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {lastReviewLine}
          </div>
        </div>
      )}
    </Link>
  )
}

type Props = {
  scope?: 'all' | 'mine'
  limit?: number
}

export default function ActiveResearchSection({ scope = 'all', limit = 12 }: Props) {
  const { user } = useAuth()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    // 진행 중 = workflow status 'triaged' + lifecycle 이 deprecated 아닌 것
    fetchItems({ workflow: 'triaged', sort: 'published', limit })
      .then((data) => {
        if (cancelled) return
        let filtered = (data ?? []).filter((it) => it.lifecycle_status !== 'deprecated')
        if (scope === 'mine' && user?.id) {
          filtered = filtered.filter((it) =>
            (it.assignments ?? []).some((a) => a.assignee_id === user.id)
          )
        }
        setItems(filtered)
      })
      .catch(() => { if (!cancelled) setItems([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [scope, limit, user?.id])

  const title = scope === 'mine' ? '내 진행 중인 연구' : '진행 중인 연구'

  return (
    <div className="opacity-0 animate-fade-in stagger-2" style={{ ...cardStyle, overflow: 'hidden', marginBottom: 24 }}>
      <div style={{
        padding: '20px 28px', borderBottom: '1px solid #f1f5f9',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {title}
            <span style={{ marginLeft: 8, color: 'var(--color-text-muted)', fontWeight: 400 }}>
              ({items.length})
            </span>
          </h3>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
            {scope === 'mine'
              ? '나에게 배정되어 진행 중인 SOTA 모델 — 클릭해서 상세 보기'
              : '카테고리별로 분류·테스트 중인 SOTA 모델 — 담당자와 최근 메모'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/vfx/triage" style={{
            padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500,
            color: 'var(--color-text-secondary)', textDecoration: 'none',
            border: '1px solid var(--color-border)', background: '#fff',
          }}>Triage</Link>
          <Link to="/vfx" style={{
            padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            color: '#fff', textDecoration: 'none',
            background: 'var(--color-accent)',
          }}>VFX 대시보드 →</Link>
        </div>
      </div>

      <div style={{ padding: 20 }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
            로딩 중...
          </div>
        ) : items.length === 0 ? (
          <div style={{
            padding: 32, textAlign: 'center', fontSize: 13,
            color: 'var(--color-text-muted)',
            border: '1px dashed var(--color-border)', borderRadius: 12,
          }}>
            {scope === 'mine' ? (
              <>나에게 배정된 진행 중 모델이 없습니다.</>
            ) : (
              <>진행 중인 모델이 없습니다. <Link to="/vfx/triage" style={{ color: 'var(--color-accent)', fontWeight: 500 }}>VFX Triage</Link> 에서 새 모델 분류 + 배정해보세요.</>
            )}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 12,
          }}>
            {items.map((item) => <ResearchCard key={item.id} item={item} />)}
          </div>
        )}
      </div>
    </div>
  )
}
