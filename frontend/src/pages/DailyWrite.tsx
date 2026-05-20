import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { api } from '../api/client'

type TaskStatus = '진행중' | '새로' | '완료' | '블로킹'
type SectionKey = 'yesterday' | 'today' | 'issue' | 'misc'

interface AssignedTask {
  id: string
  title: string
  status: TaskStatus
  project_id?: string
  project_name?: string
}

// SOTA 배정 — 학생이 매일 데일리 쓰면서 inline 메모 (= SotaReview) 제출
interface MySotaAssignment {
  id: string
  sota_item_id: number
  status: string                       // recommended/assigned/in_review/submitted/approved/rejected
  due_date: string | null
  item_title: string | null            // backend nested (SotaAssignmentResponse.item_*)
  item_source: string | null
  item_url: string | null
  item_lifecycle_status: string | null
  item_priority: string | null
  reviews_count: number
}

const SOTA_STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  recommended: { bg: '#f0fdf4', color: '#15803d', label: '추천' },
  assigned:    { bg: '#e0e7ff', color: '#4338ca', label: '배정됨' },
  in_review:   { bg: '#fef3c7', color: '#b45309', label: '리뷰중' },
  submitted:   { bg: '#dbeafe', color: '#1d4ed8', label: '제출완료' },
  approved:    { bg: '#d1fae5', color: '#047857', label: '승인' },
  rejected:    { bg: '#fee2e2', color: '#dc2626', label: '반려' },
}

const SOTA_LIFECYCLE_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  research:   { bg: '#f1f5f9', color: '#475569', label: '연구' },
  dev:        { bg: '#dbeafe', color: '#1d4ed8', label: '개발' },
  testing:    { bg: '#fef3c7', color: '#b45309', label: '테스트' },
  production: { bg: '#d1fae5', color: '#047857', label: '운영' },
  deprecated: { bg: '#fee2e2', color: '#dc2626', label: '폐기' },
}

interface BlockMeta {
  task_id: string | null
  project_id: string | null
  tags: string[]
  image_url: string | null
  image_file?: File | null
}

const DRAFT_STORAGE_KEY = 'dailyWrite_draft_v3'
const AUTOSAVE_INTERVAL = 30000

const statusConfig: Record<TaskStatus, { bg: string; color: string; icon: string }> = {
  '진행중': { bg: '#e0e7ff', color: '#4338ca', icon: '▶' },
  '새로': { bg: '#d1fae5', color: '#047857', icon: '●' },
  '완료': { bg: '#f1f5f9', color: '#64748b', icon: '✓' },
  '블로킹': { bg: '#ffe4e6', color: '#be123c', icon: '!' },
}

const statusToApi: Record<TaskStatus, string> = {
  '진행중': 'in_progress',
  '새로': 'not_started',
  '완료': 'done',
  '블로킹': 'blocked',
}

interface SectionDef {
  key: SectionKey
  label: string
  placeholder: string
  collapsible: boolean
  color: string
}

const sections: SectionDef[] = [
  { key: 'yesterday', label: '어제 한 일', placeholder: '어제 진행한 내용을 자유롭게 작성하세요...\n\n문단을 나누면 블록으로 분리됩니다.', collapsible: false, color: '#4f46e5' },
  { key: 'today', label: '오늘 할 일', placeholder: '오늘 진행할 내용을 작성하세요...\n\n문단을 나누면 블록으로 분리됩니다.', collapsible: false, color: '#0891b2' },
  { key: 'issue', label: '이슈 / 논의', placeholder: '공유할 이슈나 논의사항이 있으면 작성하세요...', collapsible: true, color: '#dc2626' },
  { key: 'misc', label: '기타 메모', placeholder: '태스크와 무관한 메모, 아이디어 등...', collapsible: true, color: '#94a3b8' },
]

const cardStyle = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
}

// ─── Block action toolbar for each paragraph ───
function BlockToolbar({
  meta,
  tasks,
  tasksByProject,
  onSetTask,
  onAddTag,
  onRemoveTag,
  onImageUpload,
  onImageRemove,
}: {
  meta: BlockMeta
  tasks: AssignedTask[]
  tasksByProject: { projectName: string; tasks: AssignedTask[] }[]
  onSetTask: (taskId: string | null, projectId: string | null) => void
  onAddTag: (tag: string) => void
  onRemoveTag: (tag: string) => void
  onImageUpload: (file: File) => void
  onImageRemove: () => void
}) {
  const [showTask, setShowTask] = useState(false)
  const [showTag, setShowTag] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const linkedTask = meta.task_id ? tasks.find(t => t.id === meta.task_id) : null

  const btnStyle = (active: boolean) => ({
    padding: '3px 6px', borderRadius: 5, fontSize: 11, fontWeight: 500 as const,
    border: 'none', cursor: 'pointer' as const, transition: 'all 0.12s',
    background: active ? '#eef2ff' : 'transparent',
    color: active ? '#4338ca' : '#94a3b8',
    display: 'flex' as const, alignItems: 'center' as const, gap: 3,
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
      {/* Task button */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={(e) => { e.stopPropagation(); setShowTask(!showTask); setShowTag(false) }}
          style={btnStyle(!!meta.task_id)}
          title="태스크 연결"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
          </svg>
          {linkedTask && (
            <span style={{ fontSize: 10, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {linkedTask.title}
            </span>
          )}
        </button>
        {showTask && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', top: '100%', right: 0, zIndex: 20, marginTop: 4,
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)', padding: 4, minWidth: 200, maxHeight: 240,
              overflowY: 'auto' as const,
            }}
          >
            <div
              onClick={() => { onSetTask(null, null); setShowTask(false) }}
              style={{ padding: '5px 10px', fontSize: 12, color: '#94a3b8', cursor: 'pointer', borderRadius: 4 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              연결 없음
            </div>
            {tasksByProject.map(group => (
              <div key={group.projectName}>
                <div style={{ padding: '6px 10px 2px', fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' as const }}>
                  {group.projectName}
                </div>
                {group.tasks.map(t => (
                  <div
                    key={t.id}
                    onClick={() => { onSetTask(t.id, t.project_id || null); setShowTask(false) }}
                    style={{
                      padding: '5px 10px', fontSize: 12, cursor: 'pointer', borderRadius: 4,
                      color: meta.task_id === t.id ? '#4338ca' : '#1e293b',
                      fontWeight: meta.task_id === t.id ? 600 : 400,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    {t.title}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tag button */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={(e) => { e.stopPropagation(); setShowTag(!showTag); setShowTask(false) }}
          style={btnStyle(meta.tags.length > 0)}
          title="태그 추가"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
            <line x1="7" y1="7" x2="7.01" y2="7"/>
          </svg>
          {meta.tags.length > 0 && <span style={{ fontSize: 10 }}>{meta.tags.length}</span>}
        </button>
        {showTag && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 20, marginTop: 4,
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)', padding: 8, minWidth: 160,
            }}
          >
            {meta.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                {meta.tags.map(t => (
                  <span key={t} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 2,
                    padding: '1px 6px', borderRadius: 99, fontSize: 10, fontWeight: 500,
                    background: '#e0e7ff', color: '#4338ca',
                  }}>
                    #{t}
                    <button onClick={() => onRemoveTag(t)} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#4338ca', fontSize: 11, padding: 0, lineHeight: 1,
                    }}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && tagInput.trim()) {
                    e.preventDefault()
                    onAddTag(tagInput.trim())
                    setTagInput('')
                  }
                }}
                placeholder="태그 입력..."
                autoFocus
                style={{
                  padding: '4px 8px', borderRadius: 5, fontSize: 11, flex: 1,
                  border: '1px solid #e2e8f0', outline: 'none', minWidth: 0,
                }}
              />
              <button
                onClick={() => { if (tagInput.trim()) { onAddTag(tagInput.trim()); setTagInput('') } }}
                style={{
                  padding: '4px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                  background: '#4f46e5', color: '#fff', border: 'none', cursor: 'pointer',
                }}
              >+</button>
            </div>
          </div>
        )}
      </div>

      {/* Image button */}
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setShowTask(false)
          setShowTag(false)
          // Delay click to avoid event conflicts
          setTimeout(() => fileRef.current?.click(), 0)
        }}
        style={btnStyle(!!meta.image_url)}
        title="이미지 첨부"
        type="button"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onImageUpload(file)
          e.target.value = ''
        }}
      />

      {/* Show attached image thumbnail */}
      {meta.image_url && (
        <div style={{ position: 'relative', marginLeft: 4 }}>
          <img src={meta.image_url} alt="" style={{ height: 24, borderRadius: 4, border: '1px solid #e2e8f0' }} />
          <button
            onClick={(e) => { e.stopPropagation(); onImageRemove() }}
            style={{
              position: 'absolute', top: -4, right: -4, width: 14, height: 14,
              borderRadius: 99, background: '#ef4444', color: '#fff', border: 'none',
              fontSize: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              lineHeight: 1,
            }}
          >×</button>
        </div>
      )}
    </div>
  )
}

// ─── Parse paragraphs from section content ───
function parseParagraphs(content: string): string[] {
  if (!content.trim()) return []
  return content.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
}

export default function DailyWrite() {
  const todayStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

  // Section contents
  const [sectionContents, setSectionContents] = useState<Record<string, string>>({
    yesterday: '', today: '', issue: '', misc: '',
  })
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set(['issue', 'misc']))

  // Block metadata: key = "sectionKey-paragraphIndex"
  const [blockMeta, setBlockMeta] = useState<Record<string, BlockMeta>>({})

  // Tasks
  const [tasks, setTasks] = useState<AssignedTask[]>([])
  const [taskStatuses, setTaskStatuses] = useState<Record<string, TaskStatus>>({})
  const [tasksExpanded, setTasksExpanded] = useState(true)

  // SOTA — 학생이 inline 으로 메모 작성 + 제출
  const [sotaAssignments, setSotaAssignments] = useState<MySotaAssignment[]>([])
  const [sotaMemos, setSotaMemos] = useState<Record<string, string>>({})
  const [sotaSubmitting, setSotaSubmitting] = useState<string | null>(null)
  const [sotaExpanded, setSotaExpanded] = useState(true)

  // Save state
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [existingLogId, setExistingLogId] = useState<string | null>(null)
  const [draftIndicator, setDraftIndicator] = useState<string | null>(null)
  const [showDraftRestore, setShowDraftRestore] = useState(false)

  // ── Fetch existing daily log for today ──
  useEffect(() => {
    (async () => {
      try {
        const todayISO = new Date().toISOString().split('T')[0]
        const res: any = await api.daily.list({ date_from: todayISO, date_to: todayISO })
        const items = Array.isArray(res) ? res : (res?.data || [])
        if (items.length > 0 && items[0].id) {
          setExistingLogId(String(items[0].id))
          const blocks = items[0].blocks || []
          if (blocks.length > 0) {
            const restored: Record<string, string[]> = { yesterday: [], today: [], issue: [], misc: [] }
            const restoredMeta: Record<string, BlockMeta> = {}
            for (const b of blocks) {
              const sec = b.section && restored[b.section] ? b.section : 'misc'
              const idx = restored[sec].length
              restored[sec].push(b.content)
              // Restore block metadata
              const key = `${sec}-${idx}`
              restoredMeta[key] = {
                task_id: b.task_id ? String(b.task_id) : null,
                project_id: b.project_id ? String(b.project_id) : null,
                tags: (b.tags || []).map((t: any) => t.tag?.name || t.name || '').filter(Boolean),
                image_url: null,
              }
            }
            const hasContent = Object.values(restored).some(arr => arr.length > 0)
            if (hasContent) {
              setSectionContents({
                yesterday: restored.yesterday.join('\n\n'),
                today: restored.today.join('\n\n'),
                issue: restored.issue.join('\n\n'),
                misc: restored.misc.join('\n\n'),
              })
              setBlockMeta(restoredMeta)
            }
          }
        }
      } catch { /* Backend not available */ }
    })()
  }, [])

  // ── Fetch tasks + projects ──
  useEffect(() => {
    (async () => {
      try {
        const [apiTasks, projectsRes]: any[] = await Promise.all([
          api.tasks.my(),
          api.projects.list(),
        ])
        const taskItems = Array.isArray(apiTasks) ? apiTasks : (apiTasks?.data || [])
        const projectItems = Array.isArray(projectsRes) ? projectsRes : (projectsRes?.data || [])
        const projectMap: Record<string, string> = {}
        for (const p of projectItems) {
          projectMap[String(p.id)] = p.name || p.code || ''
        }

        const statusMap: Record<string, TaskStatus> = {
          in_progress: '진행중', review: '진행중',
          todo: '새로', new: '새로', not_started: '새로',
          done: '완료', completed: '완료',
          blocked: '블로킹',
        }
        const mapped: AssignedTask[] = taskItems.map((t: any) => ({
          id: String(t.id),
          title: t.title || '',
          status: statusMap[t.status] || '새로',
          project_id: t.project_id ? String(t.project_id) : undefined,
          project_name: t.project_id ? projectMap[String(t.project_id)] : undefined,
        }))
        setTasks(mapped)
        setTaskStatuses(Object.fromEntries(mapped.map(t => [t.id, t.status])))
      } catch { /* Backend not available */ }
    })()
  }, [])

  // ── Fetch SOTA assignments (active 만) ──
  const refreshSota = useCallback(async () => {
    try {
      const res: any = await api.sota.my()
      const list = Array.isArray(res) ? res : (res?.data || [])
      // active 만: 제출 안 한 거 위주. submitted/approved/rejected 는 숨김
      const active = list.filter((a: any) =>
        !['submitted', 'approved', 'rejected'].includes(a.status)
      )
      const mapped: MySotaAssignment[] = active.map((a: any) => ({
        id: String(a.id),
        sota_item_id: Number(a.sota_item_id),
        status: a.status,
        due_date: a.due_date,
        item_title: a.item_title || `Item #${a.sota_item_id}`,
        item_source: a.item_source || null,
        item_url: a.item_url || null,
        item_lifecycle_status: a.item_lifecycle_status || null,
        item_priority: a.item_priority || null,
        reviews_count: Array.isArray(a.reviews) ? a.reviews.length : 0,
      }))
      setSotaAssignments(mapped)
    } catch { /* Backend not available */ }
  }, [])

  useEffect(() => { refreshSota() }, [refreshSota])

  // ── SOTA 리뷰 제출 + today 섹션에 자동 라인 추가 ──
  const submitSotaReview = useCallback(async (a: MySotaAssignment) => {
    const memo = (sotaMemos[a.id] || '').trim()
    if (!memo) return
    setSotaSubmitting(a.id)
    try {
      await api.sota.submitReview(a.id, { content: memo })
      // today 섹션에 자동 append (학생이 데일리 저장 시 DailyBlock 으로 영구화 + 검색 가능)
      const firstLine = memo.split('\n')[0].slice(0, 100)
      const linkLine = `[SOTA] ${a.item_title} — ${firstLine}${memo.length > 100 || memo.includes('\n') ? ' ...' : ''}`
      setSectionContents((prev) => {
        const todayText = prev.today || ''
        const sep = todayText.trim() ? '\n\n' : ''
        return { ...prev, today: todayText + sep + linkLine }
      })
      // 카드 사라짐 + 메모 clear
      setSotaMemos((prev) => { const next = { ...prev }; delete next[a.id]; return next })
      await refreshSota()
    } catch (e) {
      alert(`SOTA 리뷰 제출 실패: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSotaSubmitting(null)
    }
  }, [sotaMemos, refreshSota])

  // ── Draft ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
      if (raw) {
        const draft = JSON.parse(raw)
        const draftDate = new Date(draft.savedAt).toISOString().split('T')[0]
        const todayISO = new Date().toISOString().split('T')[0]
        if (draftDate === todayISO) setShowDraftRestore(true)
        else localStorage.removeItem(DRAFT_STORAGE_KEY)
      }
    } catch { /* ignore */ }
  }, [])

  const restoreDraft = useCallback(() => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
      if (!raw) return
      const draft = JSON.parse(raw)
      if (draft.sections) setSectionContents(draft.sections)
      if (draft.blockMeta) setBlockMeta(draft.blockMeta)
      if (draft.taskStatuses) setTaskStatuses((prev: Record<string, TaskStatus>) => ({ ...prev, ...draft.taskStatuses }))
      const savedTime = new Date(draft.savedAt)
      setDraftIndicator(`임시저장됨 ${savedTime.getHours().toString().padStart(2, '0')}:${savedTime.getMinutes().toString().padStart(2, '0')}`)
    } catch { /* ignore */ }
    setShowDraftRestore(false)
  }, [])

  const dismissDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_STORAGE_KEY)
    setShowDraftRestore(false)
  }, [])

  const saveDraftToStorage = useCallback(() => {
    try {
      const draft = { sections: sectionContents, blockMeta, taskStatuses, savedAt: new Date().toISOString() }
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
      const now = new Date()
      setDraftIndicator(`임시저장됨 ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`)
    } catch { /* ignore */ }
  }, [sectionContents, blockMeta, taskStatuses])

  useEffect(() => {
    const timer = setInterval(() => {
      const hasContent = Object.values(sectionContents).some(v => v.trim())
      if (hasContent) saveDraftToStorage()
    }, AUTOSAVE_INTERVAL)
    return () => clearInterval(timer)
  }, [saveDraftToStorage, sectionContents])

  // ── Task status ──
  const cycleStatus = async (taskId: string) => {
    const order: TaskStatus[] = ['새로', '진행중', '완료', '블로킹']
    const current = taskStatuses[taskId] || '새로'
    const next = order[(order.indexOf(current) + 1) % order.length]
    setTaskStatuses(prev => ({ ...prev, [taskId]: next }))
    try { await api.tasks.updateStatus(taskId, statusToApi[next]) } catch { /* ignore */ }
  }

  const handleSectionChange = (key: string, value: string) => {
    setSectionContents(prev => ({ ...prev, [key]: value }))
    if (value.trim() && collapsedSections.has(key)) {
      setCollapsedSections(prev => { const n = new Set(prev); n.delete(key); return n })
    }
  }

  const toggleSection = (key: string) => {
    setCollapsedSections(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })
  }

  // ── Block meta helpers ──
  const getBlockMeta = (key: string): BlockMeta => {
    return blockMeta[key] || { task_id: null, project_id: null, tags: [], image_url: null }
  }

  const updateBlockMeta = (key: string, updates: Partial<BlockMeta>) => {
    setBlockMeta(prev => ({
      ...prev,
      [key]: { ...getBlockMeta(key), ...updates },
    }))
  }

  const handleImageUpload = async (key: string, file: File) => {
    // Show local preview immediately
    const localUrl = URL.createObjectURL(file)
    updateBlockMeta(key, { image_url: localUrl, image_file: file })
  }

  // ── Parsed paragraphs per section (memoized) ──
  const sectionParagraphs = useMemo(() => {
    const result: Record<string, string[]> = {}
    for (const sec of sections) {
      result[sec.key] = parseParagraphs(sectionContents[sec.key] || '')
    }
    return result
  }, [sectionContents])

  // ── Save ──
  const handleSave = async (isFinal: boolean) => {
    setSaving(true)
    setSaveMessage('')
    try {
      const todayISO = new Date().toISOString().split('T')[0]
      const rawParts: string[] = []
      for (const sec of sections) {
        const content = sectionContents[sec.key]?.trim()
        if (content) rawParts.push(`## ${sec.label}\n${content}`)
      }
      const rawContent = rawParts.join('\n\n')

      let log: any
      if (existingLogId) {
        log = await api.daily.update(existingLogId, { date: todayISO, raw_content: rawContent })
        if (!log?.id) log = { id: existingLogId }
      } else {
        log = await api.daily.create({ date: todayISO, raw_content: rawContent })
        if (log?.id) setExistingLogId(String(log.id))
      }

      // Upload images first
      const imageUploads: Record<string, string> = {}
      for (const [key, meta] of Object.entries(blockMeta)) {
        if (meta.image_file) {
          try {
            const uploaded: any = await api.uploads.upload(meta.image_file)
            if (uploaded?.url) imageUploads[key] = uploaded.url
          } catch { /* ignore upload errors */ }
        }
      }

      // Build blocks with metadata
      let blockOrder = 0
      const blocks: any[] = []
      const blockKeyMap: { key: string; order: number }[] = []
      for (const sec of sections) {
        const paragraphs = sectionParagraphs[sec.key]
        for (let i = 0; i < paragraphs.length; i++) {
          const key = `${sec.key}-${i}`
          const meta = getBlockMeta(key)
          const visibility = meta.project_id ? 'project' : 'advisor'
          blocks.push({
            content: paragraphs[i],
            block_order: blockOrder,
            section: sec.key,
            project_id: meta.project_id || undefined,
            task_id: meta.task_id || undefined,
            visibility,
          })
          blockKeyMap.push({ key, order: blockOrder })
          blockOrder++
        }
      }

      let createdBlocks: any[] = []
      if (log?.id && blocks.length > 0) {
        const result = await api.daily.createBlocks(String(log.id), blocks)
        createdBlocks = Array.isArray(result) ? result : []
      }

      // After blocks created, attach tags and images
      for (let i = 0; i < blockKeyMap.length; i++) {
        const { key } = blockKeyMap[i]
        const meta = getBlockMeta(key)
        const createdBlock = createdBlocks[i]
        if (!createdBlock?.id) continue

        // Attach tags
        for (const tagName of meta.tags) {
          try {
            let tagId: string | null = null
            try {
              const created: any = await api.tags.create({ name: tagName })
              if (created?.id) tagId = String(created.id)
            } catch {
              const list: any = await api.tags.list()
              const items = Array.isArray(list) ? list : (list?.data || [])
              const found = items.find((t: any) => t.name === tagName)
              if (found?.id) tagId = String(found.id)
            }
            if (tagId) {
              await api.daily.addBlockTag(createdBlock.id, tagId)
            }
          } catch { /* ignore tag errors */ }
        }
      }

      if (isFinal) {
        localStorage.removeItem(DRAFT_STORAGE_KEY)
        setDraftIndicator(null)
        setSaveMessage('제출 완료!')
        setTimeout(() => setSaveMessage(''), 3000)
      } else {
        saveDraftToStorage()
        setSaveMessage('임시 저장 완료')
        setTimeout(() => setSaveMessage(''), 2000)
      }
    } catch (err) {
      console.error('[DailyWrite] save failed:', err)
      const detail = err instanceof Error ? err.message : '알 수 없는 오류'
      setSaveMessage(`저장 실패: ${detail}`)
    } finally {
      setSaving(false)
    }
  }

  // ── Group tasks by project ──
  const tasksByProject: { projectName: string; tasks: AssignedTask[] }[] = []
  const noProjectTasks: AssignedTask[] = []
  const projectGroups: Record<string, AssignedTask[]> = {}
  for (const t of tasks) {
    if (t.project_id && t.project_name) {
      if (!projectGroups[t.project_name]) projectGroups[t.project_name] = []
      projectGroups[t.project_name].push(t)
    } else {
      noProjectTasks.push(t)
    }
  }
  for (const [name, gTasks] of Object.entries(projectGroups)) {
    tasksByProject.push({ projectName: name, tasks: gTasks })
  }
  if (noProjectTasks.length > 0) {
    tasksByProject.push({ projectName: '프로젝트 없음', tasks: noProjectTasks })
  }

  const totalTasks = tasks.length
  const doneTasks = Object.values(taskStatuses).filter(s => s === '완료').length

  return (
    <div style={{ width: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }} className="animate-fade-in">
        <h1 style={{ fontSize: 26, fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-display)' }}>
          오늘의 데일리
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
          <p style={{ color: '#64748b', fontSize: 15 }}>{todayStr}</p>
          {draftIndicator && (
            <span style={{
              fontSize: 11, color: '#4f46e5', fontWeight: 500,
              padding: '2px 8px', borderRadius: 6, background: '#eef2ff',
            }}>
              {draftIndicator}
            </span>
          )}
        </div>
      </div>

      {/* Draft restore banner */}
      {showDraftRestore && (
        <div style={{
          ...cardStyle,
          padding: '14px 20px', marginBottom: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#fffbeb', border: '1px solid #fde68a',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span style={{ fontSize: 13, color: '#92400e' }}>이전에 작성하던 임시저장 데이터가 있습니다.</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={restoreDraft} style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: '#f59e0b', color: '#fff', border: 'none', cursor: 'pointer',
            }}>복원</button>
            <button onClick={dismissDraft} style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
              background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', cursor: 'pointer',
            }}>삭제</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 20 }}>
        {/* ── Assigned Tasks ── */}
        {tasks.length > 0 && (
          <div className="opacity-0 animate-fade-in stagger-1" style={{ ...cardStyle, overflow: 'hidden' }}>
            <button
              onClick={() => setTasksExpanded(!tasksExpanded)}
              style={{
                width: '100%', padding: '16px 24px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' as const,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                </svg>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>이번 주 배정 태스크</span>
                <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>{totalTasks}건 / {doneTasks}건 완료</span>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: tasksExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {tasksExpanded && (
              <div style={{ padding: '0 24px 16px' }}>
                {tasksByProject.map((group) => (
                  <div key={group.projectName} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6, paddingLeft: 2 }}>
                      {group.projectName}
                    </div>
                    {group.tasks.map((task) => {
                      const st = statusConfig[taskStatuses[task.id] || task.status]
                      return (
                        <div key={task.id} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 10px', borderRadius: 10, marginBottom: 2, transition: 'background 0.1s',
                        }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                        >
                          <button onClick={() => cycleStatus(task.id)} title="클릭하여 상태 변경" style={{
                            padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                            background: st.bg, color: st.color, border: 'none', cursor: 'pointer', flexShrink: 0,
                          }}>
                            {st.icon} {taskStatuses[task.id] || task.status}
                          </button>
                          <span style={{
                            fontSize: 13, color: '#1e293b', flex: 1,
                            textDecoration: (taskStatuses[task.id] || task.status) === '완료' ? 'line-through' : 'none',
                            opacity: (taskStatuses[task.id] || task.status) === '완료' ? 0.5 : 1,
                          }}>
                            {task.title}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── 내 SOTA 배정 — inline 메모 제출 (SotaReview 생성 + today 섹션 자동 append) ── */}
        {sotaAssignments.length > 0 && (
          <div className="opacity-0 animate-fade-in stagger-1" style={{ ...cardStyle, overflow: 'hidden' }}>
            <button
              onClick={() => setSotaExpanded(!sotaExpanded)}
              style={{
                width: '100%', padding: '16px 24px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' as const,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>내 SOTA 배정</span>
                <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>{sotaAssignments.length}건 (메모 작성 + 제출 = 오늘 활동에 자동 기록)</span>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: sotaExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {sotaExpanded && (
              <div style={{ padding: '0 24px 16px' }}>
                {sotaAssignments.map((a) => {
                  const stBadge = SOTA_STATUS_BADGE[a.status] || { bg: '#f1f5f9', color: '#64748b', label: a.status }
                  const lcBadge = a.item_lifecycle_status ? SOTA_LIFECYCLE_BADGE[a.item_lifecycle_status] : null
                  const memo = sotaMemos[a.id] || ''
                  const submitting = sotaSubmitting === a.id
                  const overdue = a.due_date && new Date(a.due_date) < new Date(new Date().toDateString())
                  return (
                    <div key={a.id} style={{
                      padding: '12px 14px', borderRadius: 10, marginBottom: 10,
                      background: '#fafbff', border: '1px solid #eef2ff',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                          background: stBadge.bg, color: stBadge.color,
                        }}>{stBadge.label}</span>
                        {a.item_source && (
                          <span style={{ fontSize: 11, color: '#64748b', padding: '2px 7px', borderRadius: 5, background: '#f1f5f9' }}>
                            {a.item_source}
                          </span>
                        )}
                        {lcBadge && (
                          <span style={{
                            padding: '2px 7px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                            background: lcBadge.bg, color: lcBadge.color,
                          }}>{lcBadge.label}</span>
                        )}
                        {a.item_priority && (
                          <span style={{
                            padding: '2px 7px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                            background: a.item_priority === 'P0' ? '#fee2e2' : a.item_priority === 'P1' ? '#fef3c7' : '#f1f5f9',
                            color: a.item_priority === 'P0' ? '#dc2626' : a.item_priority === 'P1' ? '#b45309' : '#64748b',
                          }}>{a.item_priority}</span>
                        )}
                        <a
                          href={`/vfx/item/${a.sota_item_id}`}
                          style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', textDecoration: 'none', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {a.item_title}
                        </a>
                        {a.due_date && (
                          <span style={{ fontSize: 11, color: overdue ? '#dc2626' : '#94a3b8', fontWeight: overdue ? 600 : 400 }}>
                            마감 {new Date(a.due_date).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                          </span>
                        )}
                        {a.reviews_count > 0 && (
                          <span style={{ fontSize: 10, color: '#94a3b8' }}>이전 리뷰 {a.reviews_count}건</span>
                        )}
                      </div>
                      <textarea
                        value={memo}
                        onChange={(e) => setSotaMemos((prev) => ({ ...prev, [a.id]: e.target.value }))}
                        placeholder="오늘 테스트한 결과 / 메모 — 한 줄 또는 여러 줄. 제출하면 오늘 활동에도 자동 기록됨."
                        rows={2}
                        style={{
                          width: '100%', padding: '8px 10px', borderRadius: 8,
                          border: '1px solid #e2e8f0', fontSize: 13, outline: 'none',
                          resize: 'vertical' as const, boxSizing: 'border-box' as const,
                          lineHeight: 1.5, background: '#fff',
                          fontFamily: 'inherit',
                        }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6, gap: 6 }}>
                        <button
                          disabled={!memo.trim() || submitting}
                          onClick={() => submitSotaReview(a)}
                          style={{
                            padding: '5px 12px', borderRadius: 6, border: 'none',
                            fontSize: 12, fontWeight: 600,
                            cursor: memo.trim() && !submitting ? 'pointer' : 'not-allowed',
                            background: memo.trim() && !submitting ? '#7c3aed' : '#e9d5ff',
                            color: '#fff',
                            transition: 'all 0.15s',
                          }}
                        >
                          {submitting ? '제출 중...' : '리뷰 제출 + 오늘 기록'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Section Editors with inline block tools ── */}
        <div className="opacity-0 animate-fade-in stagger-2" style={{ ...cardStyle, overflow: 'hidden' }}>
          {sections.map((sec, idx) => {
            const content = sectionContents[sec.key] || ''
            const isCollapsed = sec.collapsible && collapsedSections.has(sec.key) && !content.trim()
            const isLast = idx === sections.length - 1
            const paragraphs = sectionParagraphs[sec.key]

            return (
              <div key={sec.key} style={{ borderBottom: isLast ? 'none' : '1px solid #f1f5f9' }}>
                {/* Section header */}
                <div
                  onClick={sec.collapsible && !content.trim() ? () => toggleSection(sec.key) : undefined}
                  style={{
                    padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 8,
                    cursor: sec.collapsible && !content.trim() ? 'pointer' : 'default',
                  }}
                >
                  <div style={{ width: 3, height: 18, borderRadius: 2, background: sec.color }} />
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', flex: 1 }}>{sec.label}</span>
                  {sec.collapsible && !content.trim() && (
                    <span style={{ fontSize: 12, color: '#cbd5e1' }}>{isCollapsed ? '펼치기' : '접기'}</span>
                  )}
                </div>

                {!isCollapsed && (
                  <div style={{ padding: '0 24px 16px' }}>
                    {/* Textarea */}
                    <textarea
                      value={content}
                      onChange={(e) => handleSectionChange(sec.key, e.target.value)}
                      placeholder={sec.placeholder}
                      style={{
                        width: '100%', minHeight: sec.collapsible ? 80 : 120,
                        padding: '14px 16px', borderRadius: 10, border: '1px solid #e2e8f0',
                        fontSize: 14, color: '#0f172a', lineHeight: 1.8,
                        outline: 'none', resize: 'vertical' as const, fontFamily: 'inherit',
                        background: '#fff', transition: 'border-color 0.15s',
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = sec.color }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = '#e2e8f0' }}
                    />

                    {/* Block previews with toolbars */}
                    {paragraphs.length > 0 && (
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                        {paragraphs.map((para, i) => {
                          const key = `${sec.key}-${i}`
                          const meta = getBlockMeta(key)
                          const hasAnyMeta = meta.task_id || meta.tags.length > 0 || meta.image_url

                          return (
                            <div
                              key={key}
                              style={{
                                display: 'flex', alignItems: 'flex-start', gap: 8,
                                padding: '6px 10px', borderRadius: 8,
                                background: hasAnyMeta ? '#fafafe' : '#f8fafc',
                                border: hasAnyMeta ? '1px solid #e0e7ff' : '1px solid transparent',
                                transition: 'all 0.15s',
                              }}
                            >
                              {/* Paragraph text preview */}
                              <div style={{
                                flex: 1, fontSize: 12, color: '#64748b', lineHeight: 1.5,
                                overflow: 'hidden', display: '-webkit-box',
                                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any,
                              }}>
                                {para}
                              </div>

                              {/* Toolbar */}
                              <div style={{ flexShrink: 0 }}>
                                <BlockToolbar
                                  meta={meta}
                                  tasks={tasks}
                                  tasksByProject={tasksByProject}
                                  onSetTask={(tid, pid) => updateBlockMeta(key, { task_id: tid, project_id: pid })}
                                  onAddTag={(tag) => {
                                    const m = getBlockMeta(key)
                                    if (!m.tags.includes(tag)) {
                                      updateBlockMeta(key, { tags: [...m.tags, tag] })
                                    }
                                  }}
                                  onRemoveTag={(tag) => {
                                    const m = getBlockMeta(key)
                                    updateBlockMeta(key, { tags: m.tags.filter(t => t !== tag) })
                                  }}
                                  onImageUpload={(file) => handleImageUpload(key, file)}
                                  onImageRemove={() => updateBlockMeta(key, { image_url: null, image_file: null })}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Action Buttons ── */}
        <div className="opacity-0 animate-fade-in stagger-3" style={{
          display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 32,
        }}>
          {saveMessage && (
            <span style={{ fontSize: 13, fontWeight: 500, color: saveMessage.includes('실패') ? '#be123c' : '#047857' }}>
              {saveMessage}
            </span>
          )}
          <button disabled={saving} onClick={() => saveDraftToStorage()} style={{
            padding: '10px 24px', borderRadius: 10, fontSize: 14, fontWeight: 500,
            background: '#f1f5f9', color: '#475569', border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
          }}>
            임시저장
          </button>
          <button disabled={saving} onClick={() => handleSave(true)} style={{
            padding: '10px 28px', borderRadius: 10, fontSize: 14, fontWeight: 600,
            background: '#4f46e5', color: '#fff', border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer',
            boxShadow: '0 2px 8px rgba(79,70,229,0.3)', opacity: saving ? 0.6 : 1,
          }}>
            {saving ? '저장 중...' : '제출'}
          </button>
        </div>
      </div>
    </div>
  )
}
