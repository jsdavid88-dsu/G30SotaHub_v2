import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useRole } from '../contexts/RoleContext'

// ── Types ────────────────────────────────────────────────────────────────
// Phase 1 통합 (2026-05-07): SotaItem.id 가 UUID → int 로 변경됨.
// VFX Item 과 통합되어 자동 수집 + 수동 등록 모두 동일 모델.

type SotaReview = {
  id: string
  sota_assignment_id: string
  reviewer_id: string
  reviewer_name: string
  content: string
  submitted_at: string | null
  created_at: string
}

type SotaAssignment = {
  id: string
  sota_item_id: number   // was string (UUID)
  assignee_id: string
  assignee_name: string
  assigned_by: string | null
  status: string
  due_date: string | null
  created_at: string
  reviews: SotaReview[]
}

type SotaItem = {
  id: number               // was string (UUID)
  title: string
  source: string | null    // 'manual' = Hub 수동 등록, 'arxiv'/'github'/'hf'/'reddit'/'x' = 자동 수집
  external_id?: string | null
  url: string | null
  summary: string | null   // = abstract
  published_at: string | null
  discovered_at?: string | null
  created_at: string
  assignments_count: number
  llm_analysis: string | null

  // 통합 후 신규 필드
  description?: string | null
  wiki_body?: string | null
  confidence_status?: string | null
  version?: number
  refs?: Record<string, string | null>
  lifecycle_status?: string
  priority?: string | null
  llm_score?: number
  llm_reason?: string | null
  free_tags?: string[]
  category_slugs?: string[]
}

type SotaItemDetail = SotaItem & {
  assignments: SotaAssignment[]
}

type UserSummary = {
  id: string
  name: string
  email: string
  role: string
}

// ── API helpers ───────────────────────────────────────────────────────────

const API_BASE = '/api/v1'

async function sotaRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token')
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  })
  if (!res.ok) {
    if (res.status === 501) {
      const data = await res.json()
      throw new Error(data.detail || 'Not implemented')
    }
    throw new Error(`API Error: ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

const sotaApi = {
  list: (params?: Record<string, string>) =>
    sotaRequest<SotaItem[]>(`/sota/?${new URLSearchParams(params)}`),
  get: (id: number) => sotaRequest<SotaItemDetail>(`/sota/${id}`),
  create: (data: any) =>
    sotaRequest<SotaItem>('/sota/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: any) =>
    sotaRequest<SotaItem>(`/sota/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: number) =>
    sotaRequest<void>(`/sota/${id}`, { method: 'DELETE' }),
  assign: (id: number, data: any) =>
    sotaRequest<SotaAssignment>(`/sota/${id}/assign`, { method: 'POST', body: JSON.stringify(data) }),
  updateAssignment: (assignmentId: string, data: any) =>
    sotaRequest<SotaAssignment>(`/sota/assignments/${assignmentId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  submitReview: (assignmentId: string, data: { content: string }) =>
    sotaRequest<SotaReview>(`/sota/assignments/${assignmentId}/review`, { method: 'POST', body: JSON.stringify(data) }),
  my: (params?: Record<string, string>) =>
    sotaRequest<SotaAssignment[]>(`/sota/my?${new URLSearchParams(params)}`),
  analyze: (id: number) => sotaRequest<any>(`/sota/${id}/analyze`),
  users: (params?: Record<string, string>) =>
    sotaRequest<any>(`/users/?${new URLSearchParams(params)}`),
}

// ── Constants ────────────────────────────────────────────────────────────

const statusLabels: Record<string, { label: string; bg: string; color: string }> = {
  recommended: { label: '추천', bg: '#f0fdf4', color: '#15803d' },
  assigned: { label: '배정됨', bg: '#e0e7ff', color: '#4338ca' },
  in_review: { label: '리뷰중', bg: '#fef3c7', color: '#b45309' },
  submitted: { label: '제출완료', bg: '#dbeafe', color: '#1d4ed8' },
  approved: { label: '승인', bg: '#d1fae5', color: '#047857' },
  rejected: { label: '반려', bg: '#fee2e2', color: '#dc2626' },
}

const lifecycleColors: Record<string, { bg: string; color: string; label: string }> = {
  research: { bg: '#f1f5f9', color: '#475569', label: '연구' },
  dev: { bg: '#dbeafe', color: '#1d4ed8', label: '개발' },
  testing: { bg: '#fef3c7', color: '#b45309', label: '테스트' },
  production: { bg: '#d1fae5', color: '#047857', label: '운영' },
  deprecated: { bg: '#fee2e2', color: '#dc2626', label: '폐기' },
}

const sourceColors: Record<string, { bg: string; color: string; label: string }> = {
  manual: { bg: '#fef3c7', color: '#92400e', label: '수동등록' },
  arxiv: { bg: '#fef2f2', color: '#dc2626', label: 'arXiv' },
  github: { bg: '#f1f5f9', color: '#0f172a', label: 'GitHub' },
  hf: { bg: '#fff7ed', color: '#ea580c', label: 'HuggingFace' },
  reddit: { bg: '#fff7ed', color: '#c2410c', label: 'Reddit' },
  x: { bg: '#f8fafc', color: '#0f172a', label: 'X' },
}

const cardStyle = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
}

const statusFilterOptions = [
  { label: '전체', value: '' },
  { label: '배정됨', value: 'assigned' },
  { label: '리뷰중', value: 'in_review' },
  { label: '제출완료', value: 'submitted' },
  { label: '승인', value: 'approved' },
  { label: '반려', value: 'rejected' },
]

// ── Component ────────────────────────────────────────────────────────────

export default function Sota() {
  const { currentRole } = useRole()

  // Common state
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Professor state
  const [items, setItems] = useState<SotaItem[]>([])
  const [selectedItem, setSelectedItem] = useState<SotaItemDetail | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [createForm, setCreateForm] = useState({ title: '', source: '', url: '', summary: '', published_at: '' })
  const [creating, setCreating] = useState(false)

  // Assign modal state
  const [assignItemId, setAssignItemId] = useState<number | null>(null)
  const [students, setStudents] = useState<UserSummary[]>([])
  const [assignForm, setAssignForm] = useState({ assignee_id: '', due_date: '' })
  const [assigning, setAssigning] = useState(false)

  // Student state
  const [myAssignments, setMyAssignments] = useState<SotaAssignment[]>([])
  const [myItems, setMyItems] = useState<Record<number, SotaItem>>({})
  const [reviewForms, setReviewForms] = useState<Record<string, string>>({})
  const [submittingReview, setSubmittingReview] = useState<string | null>(null)

  // ── Data fetching ──────────────────────────────────────────────────

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true)
      const params: Record<string, string> = {}
      if (search) params.search = search
      if (statusFilter) params.status = statusFilter
      const data = await sotaApi.list(params)
      setItems(data)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter])

  const fetchMyAssignments = useCallback(async () => {
    try {
      setLoading(true)
      const params: Record<string, string> = {}
      if (statusFilter) params.status = statusFilter
      const assignments = await sotaApi.my(params)
      setMyAssignments(assignments)

      // Fetch item details for each unique sota_item_id (now numeric)
      const itemIds = [...new Set(assignments.map((a) => a.sota_item_id))]
      const itemMap: Record<number, SotaItem> = {}
      await Promise.allSettled(
        itemIds.map(async (id) => {
          try {
            const detail = await sotaApi.get(id)
            itemMap[id] = detail
          } catch { /* ignore */ }
        })
      )
      setMyItems(itemMap)
    } catch {
      setMyAssignments([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    if (currentRole === 'student') {
      fetchMyAssignments()
    } else {
      fetchItems()
    }
  }, [currentRole, fetchItems, fetchMyAssignments])

  // ── Handlers ───────────────────────────────────────────────────────

  const handleOpenDetail = async (itemId: number) => {
    try {
      const detail = await sotaApi.get(itemId)
      setSelectedItem(detail)
      setShowDetailModal(true)
    } catch {
      alert('상세 정보를 불러올 수 없습니다.')
    }
  }

  const handleCreate = async () => {
    if (!createForm.title.trim()) return
    setCreating(true)
    try {
      const body: any = { title: createForm.title.trim() }
      if (createForm.source) body.source = createForm.source
      if (createForm.url) body.url = createForm.url
      if (createForm.summary) body.summary = createForm.summary
      if (createForm.published_at) body.published_at = new Date(createForm.published_at).toISOString()
      await sotaApi.create(body)
      setShowCreateModal(false)
      setCreateForm({ title: '', source: '', url: '', summary: '', published_at: '' })
      fetchItems()
    } catch {
      alert('논문 등록에 실패했습니다.')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (itemId: number) => {
    if (!confirm('이 SOTA 항목을 삭제하시겠습니까?')) return
    try {
      await sotaApi.delete(itemId)
      setShowDetailModal(false)
      setSelectedItem(null)
      fetchItems()
    } catch {
      alert('삭제에 실패했습니다.')
    }
  }

  const handleOpenAssign = async (itemId: number) => {
    setAssignItemId(itemId)
    setAssignForm({ assignee_id: '', due_date: '' })
    try {
      const res: any = await sotaApi.users({ role: 'student' })
      const list = res?.data || res || []
      setStudents(Array.isArray(list) ? list : [])
    } catch {
      setStudents([])
    }
    setShowAssignModal(true)
  }

  const handleAssign = async () => {
    if (!assignItemId || !assignForm.assignee_id) return
    setAssigning(true)
    try {
      const body: any = { assignee_id: assignForm.assignee_id }
      if (assignForm.due_date) body.due_date = assignForm.due_date
      await sotaApi.assign(assignItemId, body)
      setShowAssignModal(false)
      // Refresh detail if open
      if (selectedItem && selectedItem.id === assignItemId) {
        const detail = await sotaApi.get(assignItemId)
        setSelectedItem(detail)
      }
      fetchItems()
    } catch (err: any) {
      alert(err.message?.includes('409') ? '이미 배정된 학생입니다.' : '배정에 실패했습니다.')
    } finally {
      setAssigning(false)
    }
  }

  const handleStatusChange = async (assignmentId: string, newStatus: string) => {
    try {
      await sotaApi.updateAssignment(assignmentId, { status: newStatus })
      // Refresh detail
      if (selectedItem) {
        const detail = await sotaApi.get(selectedItem.id)
        setSelectedItem(detail)
      }
      fetchItems()
    } catch {
      alert('상태 변경에 실패했습니다.')
    }
  }

  const handleSubmitReview = async (assignmentId: string) => {
    const content = reviewForms[assignmentId]?.trim()
    if (!content) return
    setSubmittingReview(assignmentId)
    try {
      await sotaApi.submitReview(assignmentId, { content })
      setReviewForms((prev) => ({ ...prev, [assignmentId]: '' }))
      fetchMyAssignments()
    } catch {
      alert('리뷰 제출에 실패했습니다.')
    } finally {
      setSubmittingReview(null)
    }
  }

  const handleAnalyze = async (itemId: number) => {
    try {
      await sotaApi.analyze(itemId)
    } catch (err: any) {
      alert(err.message || 'LLM 분석 기능은 준비 중입니다')
    }
  }

  // ── Render helpers ─────────────────────────────────────────────────

  const StatusBadge = ({ status }: { status: string }) => {
    const info = statusLabels[status] || { label: status, bg: '#f1f5f9', color: '#64748b' }
    return (
      <span style={{
        display: 'inline-block', padding: '3px 10px', borderRadius: 99,
        fontSize: 12, fontWeight: 600, background: info.bg, color: info.color,
      }}>
        {info.label}
      </span>
    )
  }

  const SourceBadge = ({ source }: { source: string | null }) => {
    if (!source) return null
    const info = sourceColors[source] || { bg: '#f1f5f9', color: '#64748b', label: source }
    return (
      <span style={{
        display: 'inline-block', padding: '2px 8px', borderRadius: 6,
        fontSize: 11, fontWeight: 600, background: info.bg, color: info.color,
      }}>
        {info.label}
      </span>
    )
  }

  const LifecycleBadge = ({ status }: { status?: string }) => {
    if (!status || status === 'research') return null
    const info = lifecycleColors[status]
    if (!info) return null
    return (
      <span style={{
        display: 'inline-block', padding: '2px 8px', borderRadius: 6,
        fontSize: 11, fontWeight: 600, background: info.bg, color: info.color,
      }}>
        {info.label}
      </span>
    )
  }

  // ── EXTERNAL VIEW ──────────────────────────────────────────────────

  if (currentRole === 'external') {
    return (
      <div style={{ width: '100%' }}>
        <div style={{ marginBottom: 32 }} className="animate-fade-in">
          <h1 style={{ fontSize: 26, fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-display)' }}>
            SOTA 논문 목록
          </h1>
          <p style={{ color: '#64748b', fontSize: 15, marginTop: 6 }}>
            열람 가능한 SOTA 논문 목록입니다.
          </p>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', maxWidth: 360, marginBottom: 24 }} className="opacity-0 animate-fade-in stagger-1">
          <svg style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#94a3b8' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text" placeholder="논문 제목, 출처 검색..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '10px 14px 10px 40px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff', fontSize: 14, color: '#0f172a', outline: 'none' }}
          />
        </div>

        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>로딩 중...</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>등록된 SOTA 논문이 없습니다.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} className="opacity-0 animate-fade-in stagger-2">
            {items.map((item) => (
              <div key={item.id} style={{ ...cardStyle, padding: '20px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{item.title}</h3>
                      <SourceBadge source={item.source} />
                      <LifecycleBadge status={item.lifecycle_status} />
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#64748b', flexWrap: 'wrap' }}>
                      {item.published_at && <span>{new Date(item.published_at).toLocaleDateString('ko-KR')}</span>}
                    </div>
                    {(item.description || item.summary) && (
                      <p style={{ fontSize: 13, color: '#475569', marginTop: 8, lineHeight: 1.6 }}>
                        {item.description || item.summary}
                      </p>
                    )}
                  </div>
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer"
                      style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: '#4f46e5', textDecoration: 'none', fontWeight: 500 }}>
                      원문
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── STUDENT VIEW ───────────────────────────────────────────────────

  if (currentRole === 'student') {
    return (
      <div style={{ width: '100%' }}>
        <div style={{ marginBottom: 32 }} className="animate-fade-in">
          <h1 style={{ fontSize: 26, fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-display)' }}>
            내 배정 논문
          </h1>
          <p style={{ color: '#64748b', fontSize: 15, marginTop: 6 }}>
            배정된 SOTA 논문 리뷰를 관리합니다.
          </p>
        </div>

        {/* Status Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 4, marginBottom: 24, width: 'fit-content' }} className="opacity-0 animate-fade-in stagger-1">
          {statusFilterOptions.map((opt) => (
            <button key={opt.value} onClick={() => setStatusFilter(opt.value)}
              style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                border: 'none', cursor: 'pointer',
                background: statusFilter === opt.value ? '#f1f5f9' : 'transparent',
                color: statusFilter === opt.value ? '#0f172a' : '#94a3b8',
                transition: 'all 0.15s',
              }}>
              {opt.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>로딩 중...</div>
        ) : myAssignments.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>배정된 논문이 없습니다.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} className="opacity-0 animate-fade-in stagger-2">
            {myAssignments.map((assignment) => {
              const item = myItems[assignment.sota_item_id]
              return (
                <div key={assignment.id} style={{ ...cardStyle, padding: '24px 28px' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>
                          {item?.title || '논문 정보 로딩 중...'}
                        </h3>
                        <StatusBadge status={assignment.status} />
                        <SourceBadge source={item?.source ?? null} />
                        <LifecycleBadge status={item?.lifecycle_status} />
                      </div>
                      <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#64748b', flexWrap: 'wrap' }}>
                        {assignment.due_date && (
                          <span>마감: {new Date(assignment.due_date).toLocaleDateString('ko-KR')}</span>
                        )}
                      </div>
                      {item?.url && (
                        <a href={item.url} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 13, color: '#4f46e5', marginTop: 4, display: 'inline-block' }}>
                          논문 원문 보기
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Summary */}
                  {(item?.description || item?.summary) && (
                    <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: 10, marginBottom: 16, border: '1px solid #f1f5f9' }}>
                      <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
                        {item?.description || item?.summary}
                      </p>
                    </div>
                  )}

                  {/* Existing reviews */}
                  {assignment.reviews.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                        제출한 리뷰 ({assignment.reviews.length})
                      </p>
                      {assignment.reviews.map((review) => (
                        <div key={review.id} style={{ padding: '12px 16px', background: '#f0fdf4', borderRadius: 10, marginBottom: 8, border: '1px solid #dcfce7' }}>
                          <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{review.content}</p>
                          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                            {review.submitted_at ? new Date(review.submitted_at).toLocaleString('ko-KR') : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Review form (show if not approved) */}
                  {assignment.status !== 'approved' && (
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                        리뷰 작성
                      </p>
                      <textarea
                        value={reviewForms[assignment.id] || ''}
                        onChange={(e) => setReviewForms((prev) => ({ ...prev, [assignment.id]: e.target.value }))}
                        placeholder="논문 리뷰 내용을 작성하세요..."
                        rows={4}
                        style={{
                          width: '100%', padding: '12px 16px', borderRadius: 10, border: '1px solid #e2e8f0',
                          fontSize: 14, outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' as const,
                          lineHeight: 1.6,
                        }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                        <button
                          disabled={!(reviewForms[assignment.id]?.trim()) || submittingReview === assignment.id}
                          onClick={() => handleSubmitReview(assignment.id)}
                          style={{
                            padding: '8px 20px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 600,
                            cursor: reviewForms[assignment.id]?.trim() && submittingReview !== assignment.id ? 'pointer' : 'not-allowed',
                            background: reviewForms[assignment.id]?.trim() && submittingReview !== assignment.id ? '#4f46e5' : '#c7d2fe',
                            color: '#fff', transition: 'all 0.15s',
                          }}>
                          {submittingReview === assignment.id ? '제출 중...' : '리뷰 제출'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── PROFESSOR VIEW (default) ───────────────────────────────────────

  return (
    <div style={{ width: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 32, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }} className="animate-fade-in">
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-display)' }}>
            SOTA 관리
          </h1>
          <p style={{ color: '#64748b', fontSize: 15, marginTop: 6, lineHeight: 1.5 }}>
            {items.length}개 논문 등록됨 — 자동 수집 + 수동 등록 통합
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/vfx" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 18px', borderRadius: 12, fontSize: 13, fontWeight: 600,
            border: '1px solid #e2e8f0', background: '#fff', color: '#475569',
            textDecoration: 'none', transition: 'all 0.15s',
          }}>
            VFX 자동수집 →
          </Link>
          <button onClick={() => setShowCreateModal(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', borderRadius: 12, fontSize: 14, fontWeight: 600,
              border: 'none', cursor: 'pointer', background: '#4f46e5', color: '#fff',
              boxShadow: '0 2px 8px rgba(79,70,229,0.3)', transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#3730a3' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#4f46e5' }}>
            <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            논문 등록
          </button>
        </div>
      </div>

      {/* Search + Filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }} className="opacity-0 animate-fade-in stagger-1">
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
          <svg style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#94a3b8' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" placeholder="논문 제목, 출처, 요약 검색..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '10px 14px 10px 40px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff', fontSize: 14, color: '#0f172a', outline: 'none' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 4 }}>
          {statusFilterOptions.map((opt) => (
            <button key={opt.value} onClick={() => setStatusFilter(opt.value)}
              style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                border: 'none', cursor: 'pointer',
                background: statusFilter === opt.value ? '#f1f5f9' : 'transparent',
                color: statusFilter === opt.value ? '#0f172a' : '#94a3b8',
                transition: 'all 0.15s',
              }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Items List */}
      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>로딩 중...</div>
      ) : items.length === 0 ? (
        <div style={{ ...cardStyle, padding: 48, textAlign: 'center' }}>
          <p style={{ fontSize: 15, color: '#94a3b8' }}>등록된 SOTA 논문이 없습니다.</p>
          <p style={{ fontSize: 13, color: '#cbd5e1', marginTop: 8 }}>
            VFX 자동수집을 실행하거나 논문을 직접 등록해보세요.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} className="opacity-0 animate-fade-in stagger-2">
          {items.map((item) => (
            <div key={item.id} onClick={() => handleOpenDetail(item.id)}
              style={{ ...cardStyle, padding: '20px 24px', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#c7d2fe'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(79,70,229,0.08)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{item.title}</h3>
                    <SourceBadge source={item.source} />
                    <LifecycleBadge status={item.lifecycle_status} />
                    {item.priority && (
                      <span style={{
                        padding: '2px 8px', borderRadius: 6,
                        background: item.priority === 'P0' ? '#fee2e2' : item.priority === 'P1' ? '#fef3c7' : '#f1f5f9',
                        color: item.priority === 'P0' ? '#dc2626' : item.priority === 'P1' ? '#b45309' : '#64748b',
                        fontSize: 11, fontWeight: 600,
                      }}>
                        {item.priority}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#64748b', flexWrap: 'wrap', alignItems: 'center' }}>
                    {item.published_at && <span>{new Date(item.published_at).toLocaleDateString('ko-KR')}</span>}
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '2px 8px', borderRadius: 6, background: '#f1f5f9', fontSize: 12, fontWeight: 500, color: '#475569',
                    }}>
                      <svg style={{ width: 12, height: 12 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {item.assignments_count}명 배정
                    </span>
                    {(item.llm_score ?? 0) > 0 && (
                      <span style={{ color: '#7c3aed', fontWeight: 500 }}>
                        ⚡ Arca {item.llm_score}/100
                      </span>
                    )}
                  </div>
                  {(item.description || item.summary) && (
                    <p style={{ fontSize: 13, color: '#475569', marginTop: 8, lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>
                      {item.description || item.summary}
                    </p>
                  )}
                </div>
                <svg style={{ width: 16, height: 16, color: '#94a3b8', flexShrink: 0, marginTop: 4 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary footer */}
      <div style={{ marginTop: 20, padding: '0 4px' }} className="opacity-0 animate-fade-in stagger-3">
        <span style={{ fontSize: 13, color: '#94a3b8' }}>총 {items.length}개 논문 표시</span>
      </div>

      {/* ── Create Modal ──────────────────────────────────────────────── */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowCreateModal(false)}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 16, padding: 32, width: 520, maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 24 }}>SOTA 논문 등록</h3>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>논문 제목 *</label>
                <input value={createForm.title} onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="예: Attention Is All You Need"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>출처 (학회/저널)</label>
                <input value={createForm.source} onChange={(e) => setCreateForm((f) => ({ ...f, source: e.target.value }))}
                  placeholder="예: NeurIPS 2017"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>URL</label>
                <input value={createForm.url} onChange={(e) => setCreateForm((f) => ({ ...f, url: e.target.value }))}
                  placeholder="https://arxiv.org/abs/..."
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>요약</label>
                <textarea value={createForm.summary} onChange={(e) => setCreateForm((f) => ({ ...f, summary: e.target.value }))}
                  placeholder="논문의 핵심 내용을 간략히 작성..."
                  rows={3}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' as const }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>발행일</label>
                <input type="date" value={createForm.published_at} onChange={(e) => setCreateForm((f) => ({ ...f, published_at: e.target.value }))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 28 }}>
              <button onClick={() => { setShowCreateModal(false); setCreateForm({ title: '', source: '', url: '', summary: '', published_at: '' }) }}
                style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: '#64748b' }}>
                취소
              </button>
              <button disabled={!createForm.title.trim() || creating} onClick={handleCreate}
                style={{
                  padding: '10px 24px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 600,
                  cursor: createForm.title.trim() && !creating ? 'pointer' : 'not-allowed',
                  background: createForm.title.trim() && !creating ? '#4f46e5' : '#c7d2fe',
                  color: '#fff', transition: 'all 0.15s',
                }}>
                {creating ? '등록 중...' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Modal ──────────────────────────────────────────────── */}
      {showDetailModal && selectedItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => { setShowDetailModal(false); setSelectedItem(null) }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 16, padding: 32, width: 720, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            {/* Close button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div style={{ flex: 1, paddingRight: 16 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>{selectedItem.title}</h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <SourceBadge source={selectedItem.source} />
                  <LifecycleBadge status={selectedItem.lifecycle_status} />
                  {selectedItem.priority && (
                    <span style={{
                      padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: selectedItem.priority === 'P0' ? '#fee2e2' : selectedItem.priority === 'P1' ? '#fef3c7' : '#f1f5f9',
                      color: selectedItem.priority === 'P0' ? '#dc2626' : selectedItem.priority === 'P1' ? '#b45309' : '#64748b',
                    }}>
                      {selectedItem.priority}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => { setShowDetailModal(false); setSelectedItem(null) }}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#64748b' }}>
                <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Refs (외부 출처 통합 표시) */}
            {selectedItem.refs && Object.values(selectedItem.refs).some(Boolean) && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {Object.entries(selectedItem.refs)
                  .filter(([, v]) => Boolean(v))
                  .map(([k, v]) => (
                    <a key={k} href={v as string} target="_blank" rel="noopener noreferrer"
                      style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                        background: '#eff6ff', color: '#1d4ed8', textDecoration: 'none',
                        border: '1px solid #dbeafe',
                      }}>
                      {k}
                    </a>
                  ))}
              </div>
            )}

            {/* Paper Info */}
            <div style={{ padding: '16px 20px', background: '#f8fafc', borderRadius: 12, marginBottom: 20, border: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', gap: 20, fontSize: 13, color: '#64748b', flexWrap: 'wrap', marginBottom: (selectedItem.description || selectedItem.summary) ? 12 : 0 }}>
                {selectedItem.published_at && (
                  <span><strong style={{ color: '#475569' }}>발행일:</strong> {new Date(selectedItem.published_at).toLocaleDateString('ko-KR')}</span>
                )}
                {(selectedItem.llm_score ?? 0) > 0 && (
                  <span><strong style={{ color: '#475569' }}>Arca 점수:</strong> {selectedItem.llm_score}/100</span>
                )}
                {selectedItem.url && (
                  <a href={selectedItem.url} target="_blank" rel="noopener noreferrer"
                    style={{ color: '#4f46e5', fontWeight: 500 }}>
                    원문 →
                  </a>
                )}
              </div>
              {selectedItem.description && (
                <p style={{ fontSize: 14, color: '#0f172a', lineHeight: 1.6, fontWeight: 500, marginBottom: 8 }}>
                  {selectedItem.description}
                </p>
              )}
              {selectedItem.summary && selectedItem.summary !== selectedItem.description && (
                <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>{selectedItem.summary}</p>
              )}
            </div>

            {/* LLM Reason (Arca 코멘트) */}
            {selectedItem.llm_reason && (
              <div style={{ padding: '12px 16px', background: '#faf5ff', borderRadius: 10, marginBottom: 16, border: '1px solid #e9d5ff' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }}>
                  ⚡ Arca 분석
                </p>
                <p style={{ fontSize: 13, color: '#581c87', lineHeight: 1.6 }}>{selectedItem.llm_reason}</p>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
              <button onClick={() => handleOpenAssign(selectedItem.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  border: 'none', cursor: 'pointer', background: '#4f46e5', color: '#fff',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#3730a3' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#4f46e5' }}>
                <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                학생 배정
              </button>
              <button onClick={() => handleAnalyze(selectedItem.id)}
                title="LLM 분석 기능은 준비 중입니다"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  border: '1px solid #e2e8f0', cursor: 'not-allowed', background: '#f8fafc', color: '#94a3b8',
                  opacity: 0.7,
                }}>
                <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                AI 분석 (준비 중)
              </button>
              <button onClick={() => handleDelete(selectedItem.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  border: '1px solid #fecaca', cursor: 'pointer', background: '#fff', color: '#dc2626',
                  marginLeft: 'auto', transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#fef2f2' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#fff' }}>
                삭제
              </button>
            </div>

            {/* Assignments */}
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>
                배정 현황 ({selectedItem.assignments.length})
              </p>
              {selectedItem.assignments.length === 0 ? (
                <p style={{ fontSize: 13, color: '#94a3b8', padding: '20px 0' }}>배정된 학생이 없습니다.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {selectedItem.assignments.map((assignment) => (
                    <div key={assignment.id}
                      style={{ padding: '16px 20px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff' }}>
                      {/* Assignment header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: assignment.reviews.length > 0 ? 12 : 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: 'linear-gradient(135deg, #4f46e5, #3730a3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            <span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>
                              {assignment.assignee_name.charAt(0) || '?'}
                            </span>
                          </div>
                          <div>
                            <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{assignment.assignee_name}</span>
                            {assignment.due_date && (
                              <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 10 }}>
                                마감: {new Date(assignment.due_date).toLocaleDateString('ko-KR')}
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <StatusBadge status={assignment.status} />
                          {/* Status actions */}
                          {assignment.status === 'submitted' && (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button onClick={() => handleStatusChange(assignment.id, 'approved')}
                                style={{
                                  padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                                  border: 'none', cursor: 'pointer', background: '#d1fae5', color: '#047857',
                                  transition: 'all 0.15s',
                                }}>
                                승인
                              </button>
                              <button onClick={() => handleStatusChange(assignment.id, 'rejected')}
                                style={{
                                  padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                                  border: 'none', cursor: 'pointer', background: '#fee2e2', color: '#dc2626',
                                  transition: 'all 0.15s',
                                }}>
                                반려
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Reviews for this assignment */}
                      {assignment.reviews.length > 0 && (
                        <div style={{ marginTop: 8, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                          <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                            리뷰 ({assignment.reviews.length})
                          </p>
                          {assignment.reviews.map((review) => (
                            <div key={review.id} style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 8, marginBottom: 6, border: '1px solid #f1f5f9' }}>
                              <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{review.content}</p>
                              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                                <span>{review.reviewer_name}</span>
                                {review.submitted_at && <span>{new Date(review.submitted_at).toLocaleString('ko-KR')}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Assign Modal ──────────────────────────────────────────────── */}
      {showAssignModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowAssignModal(false)}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 16, padding: 32, width: 420, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 24 }}>학생 배정</h3>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>학생 선택 *</label>
                <select value={assignForm.assignee_id} onChange={(e) => setAssignForm((f) => ({ ...f, assignee_id: e.target.value }))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const, background: '#fff' }}>
                  <option value="">학생을 선택하세요</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6 }}>마감일</label>
                <input type="date" value={assignForm.due_date} onChange={(e) => setAssignForm((f) => ({ ...f, due_date: e.target.value }))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 28 }}>
              <button onClick={() => setShowAssignModal(false)}
                style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer', color: '#64748b' }}>
                취소
              </button>
              <button disabled={!assignForm.assignee_id || assigning} onClick={handleAssign}
                style={{
                  padding: '10px 24px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 600,
                  cursor: assignForm.assignee_id && !assigning ? 'pointer' : 'not-allowed',
                  background: assignForm.assignee_id && !assigning ? '#4f46e5' : '#c7d2fe',
                  color: '#fff', transition: 'all 0.15s',
                }}>
                {assigning ? '배정 중...' : '배정'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
