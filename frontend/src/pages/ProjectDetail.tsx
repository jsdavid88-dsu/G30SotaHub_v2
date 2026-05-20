import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useRole, isPrivileged } from '../contexts/RoleContext'
import { api } from '../api/client'
import ProjectActivityFeed from '../components/ProjectActivityFeed'

/* ── Types ─────────────────────────────────────── */

type ProjectInfo = {
  id: string
  name: string
  code: string
  description: string
  status: string
  start_date: string
  end_date: string
}

type Member = {
  id: string
  user_id: string
  name: string
  email: string
  project_role: string
}

type Assignee = {
  user_id: string
  user_name: string
  is_primary?: boolean
}

type TaskItem = {
  id: string
  title: string
  description?: string
  status: string
  priority: string
  due_date?: string
  assignees?: Assignee[]
  group_id?: string | null
}

type TaskGroup = {
  id: string
  name: string
  color: string
  status?: string
  order_index?: number
}

type DailyBlock = {
  id: string
  content: string
  log_date?: string
  author_name?: string
}

type KanbanStatus = 'todo' | 'in_progress' | 'blocked' | 'review' | 'done'

/* ── Constants ─────────────────────────────────── */

const KANBAN_COLUMNS: { key: KanbanStatus; label: string; color: string; bg: string }[] = [
  { key: 'todo', label: '할 일', color: '#64748b', bg: '#f1f5f9' },
  { key: 'in_progress', label: '진행중', color: '#4338ca', bg: '#e0e7ff' },
  { key: 'blocked', label: '차단', color: '#dc2626', bg: '#fee2e2' },
  { key: 'review', label: '리뷰', color: '#b45309', bg: '#fef3c7' },
  { key: 'done', label: '완료', color: '#047857', bg: '#d1fae5' },
]

const PRIORITY_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  urgent: { label: '긴급', bg: '#fee2e2', color: '#dc2626' },
  high: { label: '높음', bg: '#ffedd5', color: '#c2410c' },
  medium: { label: '보통', bg: '#fef3c7', color: '#b45309' },
  low: { label: '낮음', bg: '#f1f5f9', color: '#64748b' },
}

const STATUS_MAP: Record<string, string> = {
  active: '진행중', in_progress: '진행중',
  paused: '일시중단',
  planning: '계획중',
  completed: '완료', done: '완료',
}

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  '진행중': { bg: '#e0e7ff', color: '#4338ca' },
  '일시중단': { bg: '#fef3c7', color: '#b45309' },
  '계획중': { bg: '#f1f5f9', color: '#64748b' },
  '완료': { bg: '#d1fae5', color: '#047857' },
}

const ROLE_LABELS: Record<string, string> = {
  lead: '리더',
  member: '멤버',
  manager: '매니저',
}

const PRESET_COLORS = [
  { value: '#3B82F6', label: '파랑' },
  { value: '#10B981', label: '초록' },
  { value: '#F59E0B', label: '앰버' },
  { value: '#EF4444', label: '빨강' },
  { value: '#8B5CF6', label: '보라' },
  { value: '#EC4899', label: '핑크' },
  { value: '#06B6D4', label: '시안' },
  { value: '#F97316', label: '주황' },
]

const cardStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
}

/* ── Group API helpers ─────────────────────────── */

function groupHeaders() {
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  } as Record<string, string>
}

async function fetchGroups(projectId: string): Promise<TaskGroup[]> {
  const res = await fetch(`/api/v1/projects/${projectId}/groups`, { headers: groupHeaders() })
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : (data?.data || [])
}

async function createGroup(projectId: string, name: string, color: string): Promise<TaskGroup | null> {
  const res = await fetch(`/api/v1/projects/${projectId}/groups`, {
    method: 'POST',
    headers: groupHeaders(),
    body: JSON.stringify({ name, color }),
  })
  if (!res.ok) return null
  return res.json()
}

async function updateGroup(groupId: string, data: Partial<{ name: string; color: string; status: string }>): Promise<TaskGroup | null> {
  const res = await fetch(`/api/v1/groups/${groupId}`, {
    method: 'PATCH',
    headers: groupHeaders(),
    body: JSON.stringify(data),
  })
  if (!res.ok) return null
  return res.json()
}

async function deleteGroupApi(groupId: string): Promise<boolean> {
  const res = await fetch(`/api/v1/groups/${groupId}`, {
    method: 'DELETE',
    headers: groupHeaders(),
  })
  return res.ok
}

async function reorderGroups(projectId: string, groupIds: string[]): Promise<boolean> {
  const res = await fetch(`/api/v1/projects/${projectId}/groups/reorder`, {
    method: 'POST',
    headers: groupHeaders(),
    body: JSON.stringify({ group_ids: groupIds }),
  })
  return res.ok
}

/* ── Helper: lighten a hex color for background ── */

function hexToTintBg(hex: string, alpha = 0.08): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/* ── Component ─────────────────────────────────── */

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentRole } = useRole()

  // Data state
  const [project, setProject] = useState<ProjectInfo | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [dailyBlocks, setDailyBlocks] = useState<DailyBlock[]>([])
  const [groups, setGroups] = useState<TaskGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // UI state
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null)
  const [showAddMember, setShowAddMember] = useState(false)
  const [showCreateTask, setShowCreateTask] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [memberSearchResults, setMemberSearchResults] = useState<any[]>([])
  const [memberSearchLoading, setMemberSearchLoading] = useState(false)

  // Group management UI state
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupColor, setNewGroupColor] = useState(PRESET_COLORS[0].value)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingGroupName, setEditingGroupName] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  // New task form
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium',
    due_date: '',
    group_id: '',
  })
  // Track which group section triggered task creation
  const [createTaskForGroup, setCreateTaskForGroup] = useState<string | null>(null)

  // Drag state
  const [dragTaskId, setDragTaskId] = useState<string | null>(null)

  const canManage = isPrivileged(currentRole) || members.some(
    m => m.project_role === 'lead'
    // In a real app, compare with current user ID
  )

  /* ── Data Fetching ──────────────────────────── */

  const fetchData = useCallback(async () => {
    if (!id) return
    try {
      setLoading(true)
      setError(null)

      const [projectRes, membersRes, tasksRes] = await Promise.allSettled([
        api.projects.get(id),
        api.projects.members(id),
        api.tasks.listByProject(id),
      ])

      if (projectRes.status === 'fulfilled') {
        const p = projectRes.value as any
        const data = p?.data || p
        setProject({
          id: data.id || id,
          name: data.name || '',
          code: data.code || '',
          description: data.description || '',
          status: data.status || 'active',
          start_date: data.start_date || '',
          end_date: data.end_date || '',
        })
      } else {
        setError('프로젝트를 불러올 수 없습니다.')
        return
      }

      if (membersRes.status === 'fulfilled') {
        const raw = (membersRes.value as any)?.data || membersRes.value || []
        const data = (Array.isArray(raw) ? raw : []).map((m: any) => ({
          id: m.id,
          user_id: m.user_id || m.user?.id || '',
          name: m.name || m.user?.name || m.user?.email || '',
          email: m.email || m.user?.email || '',
          project_role: m.project_role || 'member',
        }))
        setMembers(data)
      }

      if (tasksRes.status === 'fulfilled') {
        const data = (tasksRes.value as any)?.data || tasksRes.value || []
        setTasks(Array.isArray(data) ? data : [])
      }

      // Fetch groups
      try {
        const groupData = await fetchGroups(id)
        setGroups(groupData)
      } catch {
        // non-critical
      }

      // Daily blocks (lower priority, don't block)
      try {
        const dailyRes: any = await api.daily.list({ project_id: id })
        const items = dailyRes?.data || dailyRes || []
        setDailyBlocks(Array.isArray(items) ? items.slice(0, 5) : [])
      } catch {
        // non-critical
      }
    } catch {
      setError('데이터를 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  /* ── Handlers ───────────────────────────────── */

  const handleSearchMembers = async (query: string) => {
    setMemberSearch(query)
    if (query.length < 2) {
      setMemberSearchResults([])
      return
    }
    try {
      setMemberSearchLoading(true)
      const res: any = await api.users.list({ search: query })
      const users = res?.data || res || []
      // Filter out existing members
      const existingIds = new Set(members.map(m => m.user_id || m.id))
      setMemberSearchResults(
        (Array.isArray(users) ? users : []).filter((u: any) => !existingIds.has(u.id))
      )
    } catch {
      setMemberSearchResults([])
    } finally {
      setMemberSearchLoading(false)
    }
  }

  const handleAddMember = async (userId: string) => {
    if (!id) return
    try {
      await api.projects.create({ project_id: id, user_id: userId, role: 'member' })
      setShowAddMember(false)
      setMemberSearch('')
      setMemberSearchResults([])
      fetchData()
    } catch {
      // Silently fail — API may not support this yet
      setShowAddMember(false)
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('이 멤버를 프로젝트에서 제거하시겠습니까?')) return
    try {
      // API endpoint may vary
      await api.users.update(memberId, { remove_project: id })
      fetchData()
    } catch {
      // non-critical
    }
  }

  const handleCreateTask = async () => {
    if (!id || !newTask.title.trim()) return
    try {
      await api.tasks.create(id, {
        title: newTask.title.trim(),
        description: newTask.description.trim(),
        priority: newTask.priority,
        due_date: newTask.due_date || undefined,
        status: 'todo',
        group_id: newTask.group_id || undefined,
      })
      setNewTask({ title: '', description: '', priority: 'medium', due_date: '', group_id: '' })
      setShowCreateTask(false)
      setCreateTaskForGroup(null)
      fetchData()
    } catch {
      // handle error
    }
  }

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    try {
      await api.tasks.updateStatus(taskId, newStatus)
      setTasks(prev =>
        prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t)
      )
      if (selectedTask?.id === taskId) {
        setSelectedTask(prev => prev ? { ...prev, status: newStatus } : null)
      }
    } catch {
      // revert would go here
    }
  }

  /* ── Group Handlers ──────────────────────────── */

  const handleCreateGroup = async () => {
    if (!id || !newGroupName.trim()) return
    const result = await createGroup(id, newGroupName.trim(), newGroupColor)
    if (result) {
      setGroups(prev => [...prev, result])
    }
    setNewGroupName('')
    setNewGroupColor(PRESET_COLORS[0].value)
    setShowGroupForm(false)
  }

  const handleUpdateGroupName = async (groupId: string) => {
    if (!editingGroupName.trim()) {
      setEditingGroupId(null)
      return
    }
    const result = await updateGroup(groupId, { name: editingGroupName.trim() })
    if (result) {
      setGroups(prev => prev.map(g => g.id === groupId ? { ...g, name: result.name } : g))
    }
    setEditingGroupId(null)
    setEditingGroupName('')
  }

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('그룹을 삭제하면 태스크는 \'미분류\'로 이동합니다')) return
    const success = await deleteGroupApi(groupId)
    if (success) {
      setGroups(prev => prev.filter(g => g.id !== groupId))
      // Move tasks to ungrouped locally
      setTasks(prev => prev.map(t => t.group_id === groupId ? { ...t, group_id: null } : t))
    }
  }

  const handleMoveGroup = async (index: number, direction: 'up' | 'down') => {
    if (!id) return
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= groups.length) return
    const newGroups = [...groups]
    const temp = newGroups[index]
    newGroups[index] = newGroups[newIndex]
    newGroups[newIndex] = temp
    setGroups(newGroups)
    await reorderGroups(id, newGroups.map(g => g.id))
  }

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const openCreateTaskForGroup = (groupId: string | null) => {
    setCreateTaskForGroup(groupId)
    setNewTask({ title: '', description: '', priority: 'medium', due_date: '', group_id: groupId || '' })
    setShowCreateTask(true)
  }

  /* ── Drag & Drop ────────────────────────────── */

  const handleDragStart = (taskId: string) => {
    setDragTaskId(taskId)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = async (e: React.DragEvent, targetStatus: KanbanStatus, targetGroupId?: string | null) => {
    e.preventDefault()
    if (!dragTaskId) return

    const task = tasks.find(t => t.id === dragTaskId)
    if (!task) { setDragTaskId(null); return }

    // Update status if changed
    const currentStatus = task.status?.toLowerCase().replace(/\s/g, '_')
    const statusChanged = currentStatus !== targetStatus && !(targetStatus === 'todo' && (currentStatus === 'todo' || currentStatus === 'pending'))
    if (statusChanged) {
      handleStatusChange(dragTaskId, targetStatus)
    }

    // Update group if different
    if (targetGroupId !== undefined && task.group_id !== targetGroupId) {
      try {
        await api.tasks.update(dragTaskId, { group_id: targetGroupId ?? null })
        setTasks(prev => prev.map(t => t.id === dragTaskId ? { ...t, group_id: targetGroupId ?? null } : t))
      } catch (err) {
        console.error('Failed to update task group:', err)
      }
    }

    setDragTaskId(null)
  }

  /* ── Grouped Tasks ──────────────────────────── */

  const tasksByStatus = (status: KanbanStatus, groupId?: string | null) =>
    tasks.filter(t => {
      const s = t.status?.toLowerCase().replace(/\s/g, '_')
      const statusMatch = status === 'todo' ? (s === 'todo' || s === 'pending') : s === status
      if (groupId === undefined) return statusMatch
      if (groupId === null) return statusMatch && !t.group_id
      return statusMatch && t.group_id === groupId
    })

  const taskCountForGroup = (groupId: string | null) =>
    tasks.filter(t => groupId === null ? !t.group_id : t.group_id === groupId).length

  const statusSummaryForGroup = (groupId: string) => {
    const groupTasks = tasks.filter(t => t.group_id === groupId)
    const counts: Record<string, number> = {}
    for (const col of KANBAN_COLUMNS) {
      const c = groupTasks.filter(t => {
        const s = t.status?.toLowerCase().replace(/\s/g, '_')
        return col.key === 'todo' ? (s === 'todo' || s === 'pending') : s === col.key
      }).length
      if (c > 0) counts[col.label] = c
    }
    return Object.entries(counts).map(([label, count]) => `${count} ${label}`).join(', ')
  }

  const hasGroups = groups.length > 0

  /* ── Render: Kanban columns ─────────────────── */

  const renderKanbanColumns = (groupId?: string | null) => (
    <div
      className="kanban-scroll"
      style={{
        display: 'flex', gap: 12,
        overflowX: 'auto', paddingBottom: 8,
      }}
    >
      {KANBAN_COLUMNS.map(col => {
        const colTasks = tasksByStatus(col.key, groupId)
        return (
          <div
            key={col.key}
            onDragOver={handleDragOver}
            onDrop={e => handleDrop(e, col.key, groupId)}
            style={{
              flex: '1 0 200px', minWidth: 200, maxWidth: 280,
              background: '#f8fafc', borderRadius: 12,
              padding: 12,
              display: 'flex', flexDirection: 'column',
            }}
          >
            {/* Column Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 12, padding: '0 4px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: col.color,
                }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                  {col.label}
                </span>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 600, color: col.color,
                background: col.bg, padding: '2px 8px', borderRadius: 99,
              }}>
                {colTasks.length}
              </span>
            </div>

            {/* Task Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 60 }}>
              {colTasks.length === 0 ? (
                <div style={{
                  padding: 16, textAlign: 'center',
                  border: '2px dashed #e2e8f0', borderRadius: 10,
                  color: '#cbd5e1', fontSize: 12,
                }}>
                  비어있음
                </div>
              ) : (
                colTasks.map(task => {
                  const pri = PRIORITY_BADGE[task.priority] || PRIORITY_BADGE.medium
                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={() => handleDragStart(task.id)}
                      onClick={() => setSelectedTask(task)}
                      style={{
                        padding: '12px 14px', borderRadius: 10,
                        background: '#fff', border: '1px solid #e2e8f0',
                        cursor: 'pointer', transition: 'all 0.15s',
                        boxShadow: dragTaskId === task.id
                          ? '0 4px 12px rgba(0,0,0,0.1)'
                          : '0 1px 2px rgba(0,0,0,0.03)',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#4f46e5' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0' }}
                    >
                      {/* Priority Badge */}
                      <span style={{
                        display: 'inline-block', fontSize: 10, fontWeight: 600,
                        padding: '2px 6px', borderRadius: 4, marginBottom: 6,
                        background: pri.bg, color: pri.color,
                      }}>
                        {pri.label}
                      </span>

                      {/* Title */}
                      <p style={{
                        fontSize: 13, fontWeight: 500, color: '#0f172a',
                        margin: '0 0 8px 0', lineHeight: 1.4,
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        display: '-webkit-box', WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}>
                        {task.title}
                      </p>

                      {/* Footer: assignee + due date */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        {/* Assignees */}
                        <div style={{ display: 'flex', gap: -4 }}>
                          {(task.assignees || []).slice(0, 3).map((a, idx) => (
                            <div key={a.user_id || idx} style={{
                              width: 22, height: 22, borderRadius: '50%',
                              background: 'linear-gradient(135deg, #94a3b8, #64748b)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              border: '2px solid #fff',
                              marginLeft: idx > 0 ? -6 : 0,
                              flexShrink: 0,
                            }}>
                              <span style={{ color: '#fff', fontSize: 9, fontWeight: 600 }}>
                                {(a.user_name || '?').charAt(0)}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Due Date */}
                        {task.due_date && (
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>
                            {task.due_date}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )
      })}
    </div>
  )

  /* ── Render: Create task form ────────────────── */

  const renderCreateTaskForm = () => (
    <div style={{
      marginBottom: 20, padding: 20, background: '#f8fafc',
      borderRadius: 12, border: '1px solid #e2e8f0',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          type="text"
          placeholder="태스크 제목"
          value={newTask.title}
          onChange={e => setNewTask(prev => ({ ...prev, title: e.target.value }))}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 8,
            border: '1px solid #e2e8f0', background: '#fff',
            fontSize: 14, color: '#0f172a', outline: 'none',
            boxSizing: 'border-box',
          }}
          autoFocus
        />
        <textarea
          placeholder="설명 (선택사항)"
          value={newTask.description}
          onChange={e => setNewTask(prev => ({ ...prev, description: e.target.value }))}
          rows={3}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 8,
            border: '1px solid #e2e8f0', background: '#fff',
            fontSize: 14, color: '#0f172a', outline: 'none',
            resize: 'vertical', fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={newTask.priority}
            onChange={e => setNewTask(prev => ({ ...prev, priority: e.target.value }))}
            style={{
              padding: '8px 12px', borderRadius: 8,
              border: '1px solid #e2e8f0', background: '#fff',
              fontSize: 13, color: '#0f172a', outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="low">낮음</option>
            <option value="medium">보통</option>
            <option value="high">높음</option>
            <option value="urgent">긴급</option>
          </select>
          <input
            type="date"
            value={newTask.due_date}
            onChange={e => setNewTask(prev => ({ ...prev, due_date: e.target.value }))}
            style={{
              padding: '8px 12px', borderRadius: 8,
              border: '1px solid #e2e8f0', background: '#fff',
              fontSize: 13, color: '#0f172a', outline: 'none',
            }}
          />
          {/* Group selector */}
          {hasGroups && (
            <select
              value={newTask.group_id}
              onChange={e => setNewTask(prev => ({ ...prev, group_id: e.target.value }))}
              style={{
                padding: '8px 12px', borderRadius: 8,
                border: '1px solid #e2e8f0', background: '#fff',
                fontSize: 13, color: '#0f172a', outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="">미분류</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => {
              setShowCreateTask(false)
              setCreateTaskForGroup(null)
            }}
            style={{
              padding: '8px 16px', borderRadius: 8,
              border: '1px solid #e2e8f0', background: '#fff',
              fontSize: 13, color: '#64748b', cursor: 'pointer',
            }}
          >
            취소
          </button>
          <button
            onClick={handleCreateTask}
            disabled={!newTask.title.trim()}
            style={{
              padding: '8px 16px', borderRadius: 8,
              border: 'none', background: newTask.title.trim() ? '#4f46e5' : '#cbd5e1',
              fontSize: 13, fontWeight: 600, color: '#fff',
              cursor: newTask.title.trim() ? 'pointer' : 'default',
            }}
          >
            생성
          </button>
        </div>
      </div>
    </div>
  )

  /* ── Render ─────────────────────────────────── */

  if (loading) {
    return (
      <div style={{ padding: '48px', color: '#94a3b8', textAlign: 'center' }}>
        로딩 중...
      </div>
    )
  }

  if (error || !project) {
    return (
      <div style={{ padding: '48px', textAlign: 'center' }}>
        <p style={{ fontSize: 15, color: '#ef4444', marginBottom: 16 }}>
          {error || '프로젝트를 찾을 수 없습니다.'}
        </p>
        <button
          onClick={() => navigate('/projects')}
          style={{
            padding: '8px 20px', borderRadius: 8, border: '1px solid #e2e8f0',
            background: '#fff', color: '#334155', fontSize: 14, cursor: 'pointer',
          }}
        >
          프로젝트 목록으로
        </button>
      </div>
    )
  }

  const displayStatus = STATUS_MAP[project.status] || project.status
  const badge = STATUS_BADGE[displayStatus] || { bg: '#f1f5f9', color: '#64748b' }

  return (
    <div style={{ width: '100%' }}>
      {/* ── Back Button ─────────────────────── */}
      <button
        onClick={() => navigate('/projects')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 0', marginBottom: 20,
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 14, color: '#64748b',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#4f46e5' }}
        onMouseLeave={e => { e.currentTarget.style.color = '#64748b' }}
      >
        <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        프로젝트 목록
      </button>

      {/* ── Project Header ──────────────────── */}
      <div style={{ ...cardStyle, padding: '28px 32px', marginBottom: 24 }} className="animate-fade-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <h1 style={{ fontSize: 26, fontWeight: 600, color: '#0f172a', fontFamily: 'var(--font-display)', margin: 0 }}>
                {project.name}
              </h1>
              <span style={{
                display: 'inline-block', padding: '4px 14px', borderRadius: 99,
                fontSize: 12, fontWeight: 600,
                background: badge.bg, color: badge.color,
              }}>
                {displayStatus}
              </span>
            </div>
            {project.code && (
              <p style={{ fontSize: 13, color: '#94a3b8', fontFamily: 'monospace', marginBottom: 8 }}>
                {project.code}
              </p>
            )}
            {project.description && (
              <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6, marginTop: 8, maxWidth: 640 }}>
                {project.description}
              </p>
            )}
            {(project.start_date || project.end_date) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 13, color: '#64748b' }}>
                <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {project.start_date && <span>{project.start_date}</span>}
                {project.start_date && project.end_date && <span>~</span>}
                {project.end_date && <span>{project.end_date}</span>}
              </div>
            )}
          </div>

          {canManage && (
            <button
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 18px', borderRadius: 10,
                fontSize: 13, fontWeight: 600,
                border: '1px solid #e2e8f0', background: '#fff', color: '#334155',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#4f46e5'; e.currentTarget.style.color = '#4f46e5' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#334155' }}
            >
              <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              편집
            </button>
          )}
        </div>
      </div>

      {/* ── 팀 활동 피드 (Phase 1B) ─────────────── */}
      {id && <ProjectActivityFeed projectId={id} />}

      {/* ── Members Section ─────────────────── */}
      <div style={{ ...cardStyle, padding: '24px 28px', marginBottom: 24 }} className="opacity-0 animate-fade-in stagger-1">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: 0 }}>
            멤버 ({members.length})
          </h2>
          {canManage && (
            <button
              onClick={() => setShowAddMember(!showAddMember)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 8,
                fontSize: 13, fontWeight: 500,
                border: 'none', background: '#4f46e5', color: '#fff',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#3730a3' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#4f46e5' }}
            >
              <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              멤버 추가
            </button>
          )}
        </div>

        {/* Add Member Modal */}
        {showAddMember && (
          <div style={{
            marginBottom: 16, padding: 16, background: '#f8fafc',
            borderRadius: 12, border: '1px solid #e2e8f0',
          }}>
            <input
              type="text"
              placeholder="이름 또는 이메일로 검색..."
              value={memberSearch}
              onChange={e => handleSearchMembers(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                border: '1px solid #e2e8f0', background: '#fff',
                fontSize: 14, color: '#0f172a', outline: 'none',
                boxSizing: 'border-box',
              }}
              autoFocus
            />
            {memberSearchLoading && (
              <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 8 }}>검색 중...</p>
            )}
            {memberSearchResults.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {memberSearchResults.map((user: any) => (
                  <div
                    key={user.id}
                    onClick={() => handleAddMember(user.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', borderRadius: 8,
                      cursor: 'pointer', transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: 'linear-gradient(135deg, #94a3b8, #64748b)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <span style={{ color: '#fff', fontSize: 11, fontWeight: 600 }}>
                        {(user.name || '?').charAt(0)}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>
                        {user.name || user.email}
                      </span>
                      {user.email && (
                        <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>
                          {user.email}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {memberSearch.length >= 2 && !memberSearchLoading && memberSearchResults.length === 0 && (
              <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 8 }}>검색 결과가 없습니다.</p>
            )}
          </div>
        )}

        {/* Member List */}
        {members.length === 0 ? (
          <p style={{ fontSize: 13, color: '#cbd5e1' }}>등록된 멤버가 없습니다.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {members.map(member => (
              <div
                key={member.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', borderRadius: 10,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: member.project_role === 'lead'
                      ? 'linear-gradient(135deg, #4f46e5, #3730a3)'
                      : member.project_role === 'manager'
                        ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                        : 'linear-gradient(135deg, #94a3b8, #64748b)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>
                      {(member.name || '?').charAt(0)}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }}>
                      {member.name || member.email}
                    </span>
                    <span style={{
                      marginLeft: 8, fontSize: 11, fontWeight: 600,
                      padding: '2px 8px', borderRadius: 4,
                      background: member.project_role === 'lead' ? '#e0e7ff'
                        : member.project_role === 'manager' ? '#fef3c7' : '#f1f5f9',
                      color: member.project_role === 'lead' ? '#4338ca'
                        : member.project_role === 'manager' ? '#b45309' : '#64748b',
                    }}>
                      {ROLE_LABELS[member.project_role] || member.project_role}
                    </span>
                  </div>
                </div>
                {canManage && member.project_role !== 'lead' && (
                  <button
                    onClick={() => handleRemoveMember(member.id)}
                    style={{
                      padding: '4px 10px', borderRadius: 6,
                      border: 'none', background: 'transparent', color: '#94a3b8',
                      fontSize: 12, cursor: 'pointer', transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = '#fef2f2' }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'transparent' }}
                  >
                    제거
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Group Management Section ─────────── */}
      {canManage && (
        <div style={{ ...cardStyle, padding: '24px 28px', marginBottom: 24 }} className="opacity-0 animate-fade-in stagger-2">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: 0 }}>
              그룹 관리
            </h2>
            <button
              onClick={() => setShowGroupForm(!showGroupForm)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 8,
                fontSize: 13, fontWeight: 500,
                border: 'none', background: '#4f46e5', color: '#fff',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#3730a3' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#4f46e5' }}
            >
              <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              그룹 추가
            </button>
          </div>

          {/* Add Group Inline Form */}
          {showGroupForm && (
            <div style={{
              marginBottom: 16, padding: 16, background: '#f8fafc',
              borderRadius: 12, border: '1px solid #e2e8f0',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input
                  type="text"
                  placeholder="그룹 이름"
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newGroupName.trim()) handleCreateGroup() }}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 8,
                    border: '1px solid #e2e8f0', background: '#fff',
                    fontSize: 14, color: '#0f172a', outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  autoFocus
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: '#64748b', marginRight: 4 }}>색상:</span>
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c.value}
                      onClick={() => setNewGroupColor(c.value)}
                      title={c.label}
                      style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: c.value, border: newGroupColor === c.value ? '3px solid #0f172a' : '2px solid #e2e8f0',
                        cursor: 'pointer', transition: 'all 0.15s',
                        flexShrink: 0,
                      }}
                    />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => { setShowGroupForm(false); setNewGroupName('') }}
                    style={{
                      padding: '8px 16px', borderRadius: 8,
                      border: '1px solid #e2e8f0', background: '#fff',
                      fontSize: 13, color: '#64748b', cursor: 'pointer',
                    }}
                  >
                    취소
                  </button>
                  <button
                    onClick={handleCreateGroup}
                    disabled={!newGroupName.trim()}
                    style={{
                      padding: '8px 16px', borderRadius: 8,
                      border: 'none', background: newGroupName.trim() ? '#4f46e5' : '#cbd5e1',
                      fontSize: 13, fontWeight: 600, color: '#fff',
                      cursor: newGroupName.trim() ? 'pointer' : 'default',
                    }}
                  >
                    추가
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Group Pills */}
          {groups.length === 0 ? (
            <p style={{ fontSize: 13, color: '#cbd5e1' }}>등록된 그룹이 없습니다. 그룹을 추가하면 칸반이 그룹별로 분류됩니다.</p>
          ) : (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              {groups.map((group, idx) => (
                <div
                  key={group.id}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '8px 14px', borderRadius: 10,
                    background: hexToTintBg(group.color, 0.1),
                    borderLeft: `4px solid ${group.color}`,
                    border: `1px solid ${hexToTintBg(group.color, 0.2)}`,
                    borderLeftWidth: 4,
                    borderLeftColor: group.color,
                    transition: 'all 0.15s',
                  }}
                >
                  {/* Color dot */}
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: group.color, flexShrink: 0,
                  }} />

                  {/* Name (editable) */}
                  {editingGroupId === group.id ? (
                    <input
                      type="text"
                      value={editingGroupName}
                      onChange={e => setEditingGroupName(e.target.value)}
                      onBlur={() => handleUpdateGroupName(group.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleUpdateGroupName(group.id)
                        if (e.key === 'Escape') { setEditingGroupId(null); setEditingGroupName('') }
                      }}
                      autoFocus
                      style={{
                        padding: '2px 6px', borderRadius: 4,
                        border: '1px solid #e2e8f0', background: '#fff',
                        fontSize: 13, fontWeight: 500, color: '#0f172a',
                        outline: 'none', width: 100,
                      }}
                    />
                  ) : (
                    <span
                      onClick={() => { setEditingGroupId(group.id); setEditingGroupName(group.name) }}
                      style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', cursor: 'pointer' }}
                      title="클릭하여 이름 수정"
                    >
                      {group.name}
                    </span>
                  )}

                  {/* Task count */}
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: group.color,
                    background: hexToTintBg(group.color, 0.15),
                    padding: '1px 7px', borderRadius: 99,
                  }}>
                    {taskCountForGroup(group.id)}
                  </span>

                  {/* Collapse toggle */}
                  <button
                    onClick={() => toggleGroupCollapse(group.id)}
                    title={collapsedGroups.has(group.id) ? '펼치기' : '접기'}
                    style={{
                      padding: 2, border: 'none', background: 'none',
                      cursor: 'pointer', color: '#64748b', fontSize: 12, lineHeight: 1,
                    }}
                  >
                    {collapsedGroups.has(group.id) ? '▶' : '▼'}
                  </button>

                  {/* Reorder arrows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    <button
                      onClick={() => handleMoveGroup(idx, 'up')}
                      disabled={idx === 0}
                      style={{
                        padding: 0, border: 'none', background: 'none',
                        cursor: idx === 0 ? 'default' : 'pointer',
                        color: idx === 0 ? '#d1d5db' : '#64748b',
                        fontSize: 10, lineHeight: 1,
                      }}
                      title="위로"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => handleMoveGroup(idx, 'down')}
                      disabled={idx === groups.length - 1}
                      style={{
                        padding: 0, border: 'none', background: 'none',
                        cursor: idx === groups.length - 1 ? 'default' : 'pointer',
                        color: idx === groups.length - 1 ? '#d1d5db' : '#64748b',
                        fontSize: 10, lineHeight: 1,
                      }}
                      title="아래로"
                    >
                      ▼
                    </button>
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => handleDeleteGroup(group.id)}
                    style={{
                      padding: '2px 4px', border: 'none', background: 'none',
                      cursor: 'pointer', color: '#94a3b8', fontSize: 14, lineHeight: 1,
                      transition: 'color 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#ef4444' }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8' }}
                    title="그룹 삭제"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Task Kanban Board ───────────────── */}
      <div style={{ ...cardStyle, padding: '24px 28px', marginBottom: 24 }} className="opacity-0 animate-fade-in stagger-3">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: 0 }}>
            태스크 ({tasks.length})
          </h2>
          {canManage && (
            <button
              onClick={() => openCreateTaskForGroup(null)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 8,
                fontSize: 13, fontWeight: 500,
                border: 'none', background: '#4f46e5', color: '#fff',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#3730a3' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#4f46e5' }}
            >
              <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              태스크 추가
            </button>
          )}
        </div>

        {/* Create Task Inline Form (top-level or for a specific group) */}
        {showCreateTask && !createTaskForGroup && renderCreateTaskForm()}

        {/* ── Grouped Kanban or Flat Kanban ──── */}
        {hasGroups ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Each group section */}
            {groups.map(group => {
              const isCollapsed = collapsedGroups.has(group.id)
              const groupTaskCount = taskCountForGroup(group.id)
              return (
                <div key={group.id}>
                  {/* Group Header Bar */}
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 16px', borderRadius: 10,
                      background: hexToTintBg(group.color, 0.06),
                      borderLeft: `4px solid ${group.color}`,
                      marginBottom: isCollapsed ? 0 : 12,
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                    onClick={() => toggleGroupCollapse(group.id)}
                    onMouseEnter={e => { e.currentTarget.style.background = hexToTintBg(group.color, 0.1) }}
                    onMouseLeave={e => { e.currentTarget.style.background = hexToTintBg(group.color, 0.06) }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 13, color: '#64748b' }}>
                        {isCollapsed ? '▶' : '▼'}
                      </span>
                      <div style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: group.color, flexShrink: 0,
                      }} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                        {group.name}
                      </span>
                      {isCollapsed && (
                        <span style={{ fontSize: 12, color: '#64748b', marginLeft: 4 }}>
                          ({groupTaskCount} tasks{groupTaskCount > 0 ? `: ${statusSummaryForGroup(group.id)}` : ''})
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, color: group.color,
                        background: hexToTintBg(group.color, 0.15),
                        padding: '2px 10px', borderRadius: 99,
                      }}>
                        {groupTaskCount}
                      </span>
                      {canManage && !isCollapsed && (
                        <button
                          onClick={e => { e.stopPropagation(); openCreateTaskForGroup(group.id) }}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '4px 10px', borderRadius: 6,
                            fontSize: 12, fontWeight: 500,
                            border: '1px solid #e2e8f0', background: '#fff', color: '#64748b',
                            cursor: 'pointer', transition: 'all 0.15s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = group.color; e.currentTarget.style.color = group.color }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#64748b' }}
                          title="이 그룹에 태스크 추가"
                        >
                          <svg style={{ width: 12, height: 12 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                          추가
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inline create form for this group */}
                  {showCreateTask && createTaskForGroup === group.id && !isCollapsed && (
                    <div style={{ marginBottom: 12 }}>
                      {renderCreateTaskForm()}
                    </div>
                  )}

                  {/* Kanban columns for this group */}
                  {!isCollapsed && renderKanbanColumns(group.id)}
                </div>
              )
            })}

            {/* Ungrouped tasks section */}
            {(() => {
              const ungroupedCount = taskCountForGroup(null)
              if (ungroupedCount === 0 && groups.length > 0) return null
              const isCollapsed = collapsedGroups.has('__ungrouped__')
              return (
                <div>
                  {/* Ungrouped Header */}
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 16px', borderRadius: 10,
                      background: '#f8fafc',
                      borderLeft: '4px solid #94a3b8',
                      marginBottom: isCollapsed ? 0 : 12,
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                    onClick={() => toggleGroupCollapse('__ungrouped__')}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 13, color: '#64748b' }}>
                        {isCollapsed ? '▶' : '▼'}
                      </span>
                      <div style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: '#94a3b8', flexShrink: 0,
                      }} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#64748b' }}>
                        미분류
                      </span>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: '#64748b',
                      background: '#f1f5f9',
                      padding: '2px 10px', borderRadius: 99,
                    }}>
                      {ungroupedCount}
                    </span>
                  </div>

                  {!isCollapsed && renderKanbanColumns(null)}
                </div>
              )
            })()}
          </div>
        ) : (
          /* Flat kanban — no groups */
          renderKanbanColumns()
        )}
      </div>

      {/* ── Task Detail Panel (Modal) ───────── */}
      {selectedTask && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.3)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
          onClick={() => setSelectedTask(null)}
        >
          <div
            style={{
              background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520,
              boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
              padding: '28px 32px', maxHeight: '80vh', overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Close */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', margin: 0, flex: 1 }}>
                {selectedTask.title}
              </h3>
              <button
                onClick={() => setSelectedTask(null)}
                style={{
                  padding: 4, border: 'none', background: 'none',
                  cursor: 'pointer', color: '#94a3b8', flexShrink: 0,
                }}
              >
                <svg style={{ width: 20, height: 20 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Group badge */}
            {selectedTask.group_id && (() => {
              const g = groups.find(gr => gr.id === selectedTask.group_id)
              if (!g) return null
              return (
                <div style={{ marginBottom: 16 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 12, fontWeight: 600,
                    padding: '4px 10px', borderRadius: 6,
                    background: hexToTintBg(g.color, 0.1), color: g.color,
                  }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: g.color }} />
                    {g.name}
                  </span>
                </div>
              )
            })()}

            {/* Description */}
            {selectedTask.description && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' as const }}>
                  설명
                </p>
                <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.6 }}>
                  {selectedTask.description}
                </p>
              </div>
            )}

            {/* Meta grid */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
              padding: 16, background: '#f8fafc', borderRadius: 12,
              marginBottom: 20,
            }}>
              {/* Status */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase' as const }}>
                  상태
                </p>
                <select
                  value={selectedTask.status}
                  onChange={e => handleStatusChange(selectedTask.id, e.target.value)}
                  style={{
                    padding: '6px 10px', borderRadius: 6,
                    border: '1px solid #e2e8f0', background: '#fff',
                    fontSize: 13, color: '#0f172a', cursor: 'pointer',
                    width: '100%', outline: 'none',
                  }}
                >
                  {KANBAN_COLUMNS.map(col => (
                    <option key={col.key} value={col.key}>{col.label}</option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase' as const }}>
                  우선순위
                </p>
                {(() => {
                  const pri = PRIORITY_BADGE[selectedTask.priority] || PRIORITY_BADGE.medium
                  return (
                    <span style={{
                      display: 'inline-block', fontSize: 12, fontWeight: 600,
                      padding: '4px 10px', borderRadius: 6,
                      background: pri.bg, color: pri.color,
                    }}>
                      {pri.label}
                    </span>
                  )
                })()}
              </div>

              {/* Due Date */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase' as const }}>
                  마감일
                </p>
                <span style={{ fontSize: 13, color: '#334155' }}>
                  {selectedTask.due_date || '-'}
                </span>
              </div>

              {/* Assignees */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase' as const }}>
                  담당자
                </p>
                {(selectedTask.assignees && selectedTask.assignees.length > 0) ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {selectedTask.assignees.map((a, idx) => (
                      <div key={a.user_id || idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{
                          width: 20, height: 20, borderRadius: '50%',
                          background: 'linear-gradient(135deg, #94a3b8, #64748b)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <span style={{ color: '#fff', fontSize: 9, fontWeight: 600 }}>
                            {(a.user_name || '?').charAt(0)}
                          </span>
                        </div>
                        <span style={{ fontSize: 13, color: '#334155' }}>
                          {a.user_name}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: 13, color: '#cbd5e1' }}>미배정</span>
                )}
              </div>
            </div>

            {/* Close button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSelectedTask(null)}
                style={{
                  padding: '8px 20px', borderRadius: 8,
                  border: '1px solid #e2e8f0', background: '#fff',
                  fontSize: 13, color: '#334155', cursor: 'pointer',
                }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Recent Daily Blocks ─────────────── */}
      {dailyBlocks.length > 0 && (
        <div style={{ ...cardStyle, padding: '24px 28px', marginBottom: 24 }} className="opacity-0 animate-fade-in stagger-4">
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: '0 0 16px 0' }}>
            최근 데일리 기록
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dailyBlocks.map(block => (
              <div
                key={block.id}
                style={{
                  padding: '12px 16px', borderRadius: 10,
                  background: '#f8fafc', border: '1px solid #f1f5f9',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  {block.author_name && (
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#4338ca' }}>
                      {block.author_name}
                    </span>
                  )}
                  {block.log_date && (
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>
                      {block.log_date}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, margin: 0 }}>
                  {block.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Responsive Styles ───────────────── */}
      <style>{`
        .kanban-scroll::-webkit-scrollbar {
          height: 6px;
        }
        .kanban-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .kanban-scroll::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 3px;
        }
        @media (max-width: 768px) {
          .kanban-scroll {
            gap: 8px !important;
          }
          .kanban-scroll > div {
            min-width: 180px !important;
          }
        }
      `}</style>
    </div>
  )
}
