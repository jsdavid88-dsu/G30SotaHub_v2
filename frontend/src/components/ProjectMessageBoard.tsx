// Phase 2 — 프로젝트 메시지 보드.
// 분산된 댓글 (SOTA item / DailyBlock) 보완. 팀 단위 자유 토론.
// - top-level 메시지 + threaded reply (parent_id self-ref)
// - @mention 알림 자동 (backend 가 services/mentions.py 사용)
// - 폴링 4초 (실시간 X — 비용 절감 + 충분)
// - 본인 메시지 edit/delete
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import AttachmentUploader, { AttachmentChip, type UploadedAttachment } from './AttachmentUploader'
import MediaViewer, { type MediaItem } from './MediaViewer'

type Message = {
  id: string
  project_id: string
  parent_id: string | null
  author_id: string
  author_name: string
  body: string
  created_at: string
  updated_at: string
  reply_count: number
}

const cardStyle: React.CSSProperties = {
  background: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  borderRadius: 16,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
}

function getHeaders(): HeadersInit {
  const token = localStorage.getItem('token')
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' }
}

function relativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diff = Math.max(0, now - then)
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}일 전`
  return new Date(iso).toLocaleDateString('ko-KR')
}

// 본문에서 @mention 토큰을 강조 표시 (cosmetic only)
function renderBody(body: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let last = 0
  const re = /@([A-Za-z0-9가-힣._@-]+)/g
  let m: RegExpExecArray | null
  let key = 0
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) parts.push(<span key={key++}>{body.slice(last, m.index)}</span>)
    parts.push(
      <span key={key++} style={{
        color: 'var(--color-accent)', fontWeight: 600,
        background: 'var(--color-accent-light)',
        padding: '0 4px', borderRadius: 4,
      }}>@{m[1]}</span>
    )
    last = m.index + m[0].length
  }
  if (last < body.length) parts.push(<span key={key++}>{body.slice(last)}</span>)
  return parts
}

export default function ProjectMessageBoard({ projectId }: { projectId: string }) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [attachmentsByMsg, setAttachmentsByMsg] = useState<Record<string, UploadedAttachment[]>>({})
  const [loading, setLoading] = useState(true)
  const [newBody, setNewBody] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])  // 게시 전 stash
  const [posting, setPosting] = useState(false)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [replyPosting, setReplyPosting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [viewerItem, setViewerItem] = useState<MediaItem | null>(null)

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/messages?limit=200`, {
        headers: getHeaders(),
      })
      if (!res.ok) {
        setMessages([])
        return
      }
      const data = await res.json()
      const list: Message[] = Array.isArray(data) ? data : (data.data || [])
      setMessages(list)

      // 각 메시지의 첨부 일괄 조회 (parallel)
      const results = await Promise.allSettled(list.map(async (m) => {
        const attRes = await fetch(
          `/api/v1/attachments?owner_type=project_message&owner_id=${m.id}`,
          { headers: getHeaders() }
        )
        if (!attRes.ok) return [m.id, []] as const
        const arr: UploadedAttachment[] = await attRes.json()
        return [m.id, arr] as const
      }))
      const map: Record<string, UploadedAttachment[]> = {}
      for (const r of results) {
        if (r.status === 'fulfilled') {
          const [id, arr] = r.value
          if (arr.length > 0) map[id] = arr
        }
      }
      setAttachmentsByMsg(map)
    } catch {
      // network — silent
    } finally {
      setLoading(false)
    }
  }, [projectId])

  // 파일 첨부 업로드 (메시지 작성 시 사용)
  const uploadAttachments = async (messageId: string, files: File[]): Promise<void> => {
    for (const file of files) {
      const form = new FormData()
      form.append('file', file)
      form.append('owner_type', 'project_message')
      form.append('owner_id', messageId)
      const token = localStorage.getItem('token')
      const res = await fetch('/api/v1/attachments', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`첨부 업로드 실패 (${res.status}): ${text.slice(0, 200)}`)
      }
    }
  }

  useEffect(() => {
    fetchMessages()
    const id = window.setInterval(fetchMessages, 4000)
    return () => window.clearInterval(id)
  }, [fetchMessages])

  // top-level vs replies
  const { topLevels, repliesByParent } = useMemo(() => {
    const tops: Message[] = []
    const replies: Record<string, Message[]> = {}
    for (const m of messages) {
      if (!m.parent_id) tops.push(m)
      else {
        if (!replies[m.parent_id]) replies[m.parent_id] = []
        replies[m.parent_id].push(m)
      }
    }
    // top-level: 최신 먼저
    tops.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    // replies 각 그룹: 오래된 먼저
    for (const k of Object.keys(replies)) {
      replies[k].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    }
    return { topLevels: tops, repliesByParent: replies }
  }, [messages])

  const submitTop = async () => {
    const body = newBody.trim()
    if (!body && pendingFiles.length === 0) return
    setPosting(true); setError(null)
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/messages`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ body: body || '(첨부 공유)' }),
      })
      if (!res.ok) throw new Error(`API ${res.status}`)
      const msg = await res.json()
      // 첨부 업로드 — 메시지 생성 직후
      if (pendingFiles.length > 0) {
        await uploadAttachments(msg.id, pendingFiles)
      }
      setNewBody('')
      setPendingFiles([])
      fetchMessages()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPosting(false)
    }
  }

  const submitReply = async (parentId: string) => {
    const body = replyBody.trim()
    if (!body) return
    setReplyPosting(true); setError(null)
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/messages`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ body, parent_id: parentId }),
      })
      if (!res.ok) throw new Error(`API ${res.status}`)
      setReplyBody('')
      setReplyTo(null)
      fetchMessages()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setReplyPosting(false)
    }
  }

  const submitEdit = async (messageId: string) => {
    const body = editBody.trim()
    if (!body) return
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/messages/${messageId}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ body }),
      })
      if (!res.ok) throw new Error(`API ${res.status}`)
      setEditingId(null)
      setEditBody('')
      fetchMessages()
    } catch (e) {
      alert(`수정 실패: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const handleDelete = async (messageId: string) => {
    if (!confirm('이 메시지를 삭제하시겠습니까? (답글도 함께 삭제됩니다)')) return
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/messages/${messageId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      })
      if (!res.ok && res.status !== 204) throw new Error(`API ${res.status}`)
      fetchMessages()
    } catch (e) {
      alert(`삭제 실패: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const renderMessage = (m: Message, isReply = false) => {
    const isMine = user?.id === m.author_id
    const editing = editingId === m.id
    return (
      <div key={m.id} style={{
        padding: '12px 16px', borderRadius: 10, marginBottom: 8,
        background: isReply ? '#fafbff' : '#ffffff',
        border: '1px solid #f1f5f9',
        marginLeft: isReply ? 24 : 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%',
            background: 'linear-gradient(135deg, #4f46e5, #3730a3)',
            color: '#fff', fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {(m.author_name || '?').charAt(0)}
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{m.author_name || '—'}</span>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>{relativeTime(m.created_at)}</span>
          {m.created_at !== m.updated_at && (
            <span style={{ fontSize: 10, color: '#cbd5e1' }}>(수정됨)</span>
          )}
          {isMine && !editing && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              <button
                onClick={() => { setEditingId(m.id); setEditBody(m.body) }}
                style={{
                  padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 500,
                  background: 'transparent', color: '#64748b',
                  border: '1px solid #e2e8f0', cursor: 'pointer',
                }}
              >수정</button>
              <button
                onClick={() => handleDelete(m.id)}
                style={{
                  padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 500,
                  background: 'transparent', color: '#dc2626',
                  border: '1px solid #fecaca', cursor: 'pointer',
                }}
              >삭제</button>
            </div>
          )}
        </div>
        {editing ? (
          <div>
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={3}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 8,
                border: '1px solid #e2e8f0', fontSize: 13, outline: 'none',
                resize: 'vertical' as const, boxSizing: 'border-box' as const,
                fontFamily: 'inherit', lineHeight: 1.5,
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
              <button
                onClick={() => { setEditingId(null); setEditBody('') }}
                style={{
                  padding: '4px 10px', borderRadius: 6, border: 'none',
                  fontSize: 12, background: 'transparent', color: '#64748b', cursor: 'pointer',
                }}
              >취소</button>
              <button
                onClick={() => submitEdit(m.id)}
                disabled={!editBody.trim()}
                style={{
                  padding: '4px 12px', borderRadius: 6, border: 'none',
                  fontSize: 12, fontWeight: 600,
                  background: editBody.trim() ? '#4f46e5' : '#c7d2fe',
                  color: '#fff', cursor: editBody.trim() ? 'pointer' : 'not-allowed',
                }}
              >저장</button>
            </div>
          </div>
        ) : (
          <div style={{
            fontSize: 13, color: '#334155', lineHeight: 1.6,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {renderBody(m.body)}
          </div>
        )}
        {/* 첨부 표시 */}
        {!editing && attachmentsByMsg[m.id] && attachmentsByMsg[m.id].length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap' }}>
            {attachmentsByMsg[m.id].map((att) => (
              <AttachmentChip
                key={att.id}
                att={att}
                onClick={() => setViewerItem({
                  id: att.id,
                  media_type: att.media_type,
                  mime: att.mime,
                  file_name: att.file_name,
                  stream_url: att.stream_url,
                  width: att.width,
                  height: att.height,
                })}
              />
            ))}
          </div>
        )}
        {!isReply && !editing && (
          <div style={{ marginTop: 6 }}>
            <button
              onClick={() => { setReplyTo(replyTo === m.id ? null : m.id); setReplyBody('') }}
              style={{
                padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 500,
                background: 'transparent', color: '#4f46e5',
                border: 'none', cursor: 'pointer',
              }}
            >
              💬 답글 {m.reply_count > 0 && `(${m.reply_count})`}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="opacity-0 animate-fade-in stagger-2" style={{ ...cardStyle, marginBottom: 24, overflow: 'hidden' }}>
      <div style={{
        padding: '20px 28px', borderBottom: '1px solid #f1f5f9',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <h3 style={{ fontSize: 17, fontWeight: 600, color: '#0f172a' }}>
            토론
            <span style={{ marginLeft: 8, color: '#94a3b8', fontWeight: 400 }}>
              ({topLevels.length})
            </span>
          </h3>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
            팀 자유 토론 — @user 로 멤버 호출. 4초마다 자동 새로고침.
          </p>
        </div>
      </div>

      <div style={{ padding: 20 }}>
        {/* 새 메시지 작성 */}
        <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 10, background: '#f8fafc', border: '1px solid #f1f5f9' }}>
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="새 메시지... @이름 으로 멤버 호출 가능"
            rows={3}
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 8,
              border: '1px solid #e2e8f0', fontSize: 13, outline: 'none',
              resize: 'vertical' as const, boxSizing: 'border-box' as const,
              fontFamily: 'inherit', lineHeight: 1.5, background: '#fff',
            }}
          />
          {/* pending 첨부 (게시 전 stash) */}
          {pendingFiles.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {pendingFiles.map((f, idx) => (
                <span key={idx} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 8px', borderRadius: 5, fontSize: 11,
                  background: '#eef2ff', color: '#4338ca',
                  border: '1px solid #c7d2fe',
                }}>
                  {f.type.startsWith('video/') ? '🎬' : '🖼️'}
                  {f.name.length > 28 ? f.name.slice(0, 26) + '…' : f.name}
                  <button
                    onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
                    style={{
                      marginLeft: 2, background: 'none', border: 'none',
                      color: '#4338ca', cursor: 'pointer', padding: 0, fontSize: 12,
                    }}
                    title="제거"
                  >×</button>
                </span>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                background: 'transparent', color: '#64748b',
                border: '1px solid #e2e8f0', cursor: posting ? 'not-allowed' : 'pointer',
                opacity: posting ? 0.5 : 1,
              }}>
                📎 이미지/영상
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  disabled={posting}
                  onChange={(e) => {
                    const files = Array.from(e.target.files || [])
                    if (files.length) setPendingFiles((prev) => [...prev, ...files])
                    e.target.value = ''
                  }}
                  style={{ display: 'none' }}
                />
              </label>
              {error && <span style={{ fontSize: 11, color: '#dc2626' }}>{error}</span>}
            </div>
            <button
              onClick={submitTop}
              disabled={(!newBody.trim() && pendingFiles.length === 0) || posting}
              style={{
                padding: '6px 14px', borderRadius: 7, border: 'none',
                fontSize: 13, fontWeight: 600,
                background: (newBody.trim() || pendingFiles.length > 0) && !posting ? '#4f46e5' : '#c7d2fe',
                color: '#fff',
                cursor: (newBody.trim() || pendingFiles.length > 0) && !posting ? 'pointer' : 'not-allowed',
              }}
            >
              {posting ? '게시 중...' : '게시'}
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            로딩 중...
          </div>
        ) : topLevels.length === 0 ? (
          <div style={{
            padding: 32, textAlign: 'center', fontSize: 13, color: '#94a3b8',
            border: '1px dashed #e2e8f0', borderRadius: 10,
          }}>
            아직 토론이 없습니다. 첫 메시지를 작성해보세요.
          </div>
        ) : (
          <div>
            {topLevels.map((m) => {
              const replies = repliesByParent[m.id] || []
              return (
                <div key={m.id} style={{ marginBottom: 16 }}>
                  {renderMessage(m)}
                  {replies.map((r) => renderMessage(r, true))}
                  {/* Reply form */}
                  {replyTo === m.id && (
                    <div style={{ marginLeft: 24, marginTop: 4, padding: '8px 10px', borderRadius: 8, background: '#fafbff', border: '1px solid #eef2ff' }}>
                      <textarea
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        placeholder="답글..."
                        rows={2}
                        autoFocus
                        style={{
                          width: '100%', padding: '6px 8px', borderRadius: 6,
                          border: '1px solid #e2e8f0', fontSize: 12, outline: 'none',
                          resize: 'vertical' as const, boxSizing: 'border-box' as const,
                          fontFamily: 'inherit', lineHeight: 1.5, background: '#fff',
                        }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 4 }}>
                        <button
                          onClick={() => { setReplyTo(null); setReplyBody('') }}
                          style={{
                            padding: '3px 8px', borderRadius: 5, border: 'none',
                            fontSize: 11, background: 'transparent', color: '#64748b', cursor: 'pointer',
                          }}
                        >취소</button>
                        <button
                          onClick={() => submitReply(m.id)}
                          disabled={!replyBody.trim() || replyPosting}
                          style={{
                            padding: '3px 10px', borderRadius: 5, border: 'none',
                            fontSize: 11, fontWeight: 600,
                            background: replyBody.trim() && !replyPosting ? '#4f46e5' : '#c7d2fe',
                            color: '#fff',
                            cursor: replyBody.trim() && !replyPosting ? 'pointer' : 'not-allowed',
                          }}
                        >
                          {replyPosting ? '게시 중' : '답글 게시'}
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

      {/* 미디어 풀스크린 뷰어 */}
      <MediaViewer item={viewerItem} onClose={() => setViewerItem(null)} />
    </div>
  )
}
