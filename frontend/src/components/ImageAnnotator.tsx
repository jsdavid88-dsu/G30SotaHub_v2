// Phase 2.5 B — 이미지 주석 (그리기 + 코멘트 스레드).
// - 핀 / 박스 / 자유선 도구로 이미지 위에 그리기
// - geometry 는 0~1 비율 좌표 (해상도 독립)
// - 마커 클릭 → 코멘트 스레드 (답글 + @mention)
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPE } from 'react'
import { MousePointer2, MapPin, Square, PenLine, Trash2, X, Send } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import {
  listAnnotations, createAnnotation, deleteAnnotation, createReply, deleteReply,
  type Annotation, type AnnotationKind,
} from '../api/annotations'

type Tool = 'view' | 'pin' | 'box' | 'freedraw'

type Draft =
  | { kind: 'box'; x: number; y: number; w: number; h: number }
  | { kind: 'freedraw'; points: [number, number][] }
  | null

type Pending = { kind: AnnotationKind; geometry: Record<string, number | number[][]> } | null

const TOOL_COLOR = '#10b981'

export default function ImageAnnotator({
  attachmentId, streamUrl, fileName,
}: {
  attachmentId: string
  streamUrl: string
  fileName?: string | null
}) {
  const { user } = useAuth()
  const isPrivileged = user?.role === 'admin' || user?.role === 'professor'
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [tool, setTool] = useState<Tool>('view')
  const [draft, setDraft] = useState<Draft>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [pendingBody, setPendingBody] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const surfaceRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<{ x: number; y: number } | null>(null)

  const refresh = useCallback(() => {
    listAnnotations(attachmentId).then(setAnnotations).catch(() => {})
  }, [attachmentId])

  useEffect(() => { refresh() }, [refresh])

  // clientXY → 0~1 비율 좌표 (이미지 표시 영역 기준)
  const toRatio = useCallback((e: RPE): { x: number; y: number } => {
    const rect = surfaceRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 }
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    return { x, y }
  }, [])

  const onPointerDown = (e: RPE) => {
    if (tool === 'view' || pending) return
    e.preventDefault()
    const p = toRatio(e)
    if (tool === 'pin') {
      setPending({ kind: 'pin', geometry: { x: p.x, y: p.y } })
      setPendingBody('')
      return
    }
    dragStart.current = p
    if (tool === 'box') setDraft({ kind: 'box', x: p.x, y: p.y, w: 0, h: 0 })
    else if (tool === 'freedraw') setDraft({ kind: 'freedraw', points: [[p.x, p.y]] })
  }

  const onPointerMove = (e: RPE) => {
    if (!dragStart.current || !draft) return
    const p = toRatio(e)
    if (draft.kind === 'box') {
      const s = dragStart.current
      setDraft({ kind: 'box', x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
    } else if (draft.kind === 'freedraw') {
      setDraft({ kind: 'freedraw', points: [...draft.points, [p.x, p.y]] })
    }
  }

  const onPointerUp = () => {
    if (!draft) return
    if (draft.kind === 'box' && (draft.w > 0.01 || draft.h > 0.01)) {
      setPending({ kind: 'box', geometry: { x: draft.x, y: draft.y, w: draft.w, h: draft.h } })
      setPendingBody('')
    } else if (draft.kind === 'freedraw' && draft.points.length > 2) {
      setPending({ kind: 'freedraw', geometry: { points: draft.points } })
      setPendingBody('')
    }
    setDraft(null)
    dragStart.current = null
  }

  const savePending = async () => {
    if (!pending) return
    try {
      await createAnnotation(attachmentId, {
        kind: pending.kind, geometry: pending.geometry, body: pendingBody.trim() || null,
      })
      setPending(null); setPendingBody(''); setTool('view'); refresh()
    } catch (e) {
      alert(`저장 실패: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const removeAnnotation = async (id: string) => {
    if (!confirm('이 주석을 삭제할까요?')) return
    await deleteAnnotation(id).catch(() => {})
    if (selectedId === id) setSelectedId(null)
    refresh()
  }

  const sendReply = async (annId: string) => {
    const body = replyBody.trim()
    if (!body) return
    await createReply(annId, body).catch(() => {})
    setReplyBody(''); refresh()
  }

  const selected = annotations.find((a) => a.id === selectedId) || null

  // ── 렌더 헬퍼 ──
  const pct = (v: number) => `${v * 100}%`

  const TOOLS: { id: Tool; icon: typeof MapPin; label: string }[] = [
    { id: 'view', icon: MousePointer2, label: '보기' },
    { id: 'pin', icon: MapPin, label: '핀' },
    { id: 'box', icon: Square, label: '박스' },
    { id: 'freedraw', icon: PenLine, label: '자유선' },
  ]

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', maxWidth: '95vw', maxHeight: '90vh' }}>
      {/* 이미지 + overlay */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        {/* 툴바 */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {TOOLS.map((t) => {
            const active = tool === t.id
            return (
              <button key={t.id} onClick={() => { setTool(t.id); setPending(null) }}
                title={t.label}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px',
                  borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: '1px solid', borderColor: active ? TOOL_COLOR : 'rgba(255,255,255,0.2)',
                  background: active ? TOOL_COLOR : 'rgba(255,255,255,0.08)',
                  color: active ? '#fff' : '#e2e8f0',
                }}>
                <t.icon style={{ width: 13, height: 13 }} /> {t.label}
              </button>
            )
          })}
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginLeft: 4 }}>
            {tool === 'view' ? '마커 클릭 → 코멘트' : '이미지 위에 그리세요'}
          </span>
        </div>

        {/* 이미지 표시 영역 */}
        <div
          ref={surfaceRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{
            position: 'relative', display: 'inline-block', lineHeight: 0,
            cursor: tool === 'view' ? 'default' : 'crosshair',
            touchAction: 'none',
          }}
        >
          <img src={streamUrl} alt={fileName || ''} draggable={false}
            style={{ maxWidth: '70vw', maxHeight: '78vh', objectFit: 'contain', display: 'block', userSelect: 'none' }} />

          {/* SVG overlay — box / freedraw */}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            {annotations.filter((a) => a.kind === 'box').map((a) => {
              const g = a.geometry as { x: number; y: number; w: number; h: number }
              return <rect key={a.id} x={g.x * 100} y={g.y * 100} width={g.w * 100} height={g.h * 100}
                fill={a.id === selectedId ? 'rgba(16,185,129,0.15)' : 'none'} stroke={TOOL_COLOR} strokeWidth={0.4}
                vectorEffect="non-scaling-stroke" style={{ cursor: 'pointer', pointerEvents: 'all' }}
                onClick={() => setSelectedId(a.id)} />
            })}
            {annotations.filter((a) => a.kind === 'freedraw').map((a) => {
              const pts = ((a.geometry as { points: [number, number][] }).points || [])
              const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0] * 100} ${p[1] * 100}`).join(' ')
              return <path key={a.id} d={d} fill="none" stroke={TOOL_COLOR} strokeWidth={0.5}
                vectorEffect="non-scaling-stroke" style={{ cursor: 'pointer', pointerEvents: 'all' }}
                onClick={() => setSelectedId(a.id)} />
            })}
            {/* draft */}
            {draft?.kind === 'box' && (
              <rect x={draft.x * 100} y={draft.y * 100} width={draft.w * 100} height={draft.h * 100}
                fill="rgba(16,185,129,0.1)" stroke={TOOL_COLOR} strokeWidth={0.4} strokeDasharray="1 1" vectorEffect="non-scaling-stroke" />
            )}
            {draft?.kind === 'freedraw' && (
              <path d={draft.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0] * 100} ${p[1] * 100}`).join(' ')}
                fill="none" stroke={TOOL_COLOR} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
            )}
          </svg>

          {/* HTML 핀 마커 (클릭 쉬움) */}
          {annotations.filter((a) => a.kind === 'pin').map((a, i) => {
            const g = a.geometry as { x: number; y: number }
            return (
              <button key={a.id} onClick={(e) => { e.stopPropagation(); setSelectedId(a.id) }}
                style={{
                  position: 'absolute', left: pct(g.x), top: pct(g.y), transform: 'translate(-50%, -100%)',
                  width: 22, height: 22, borderRadius: '50% 50% 50% 0', rotate: '-45deg',
                  background: a.id === selectedId ? '#059669' : TOOL_COLOR, border: '2px solid #fff',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.4)', padding: 0,
                }}>
                <span style={{ rotate: '45deg', color: '#fff', fontSize: 10, fontWeight: 700 }}>{i + 1}</span>
              </button>
            )
          })}

          {/* pending pin 위치 표시 */}
          {pending?.kind === 'pin' && (
            <div style={{
              position: 'absolute', left: pct(pending.geometry.x as number), top: pct(pending.geometry.y as number),
              transform: 'translate(-50%, -100%)', width: 22, height: 22, borderRadius: '50% 50% 50% 0',
              rotate: '-45deg', background: '#f59e0b', border: '2px solid #fff',
            }} />
          )}
        </div>
      </div>

      {/* 우측 패널 — pending 입력 또는 thread */}
      <div style={{
        width: 320, flexShrink: 0, background: '#fff', borderRadius: 12, padding: 16,
        display: 'flex', flexDirection: 'column', maxHeight: '86vh', overflow: 'hidden',
      }}>
        {pending ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>새 주석 ({pending.kind})</div>
            <textarea value={pendingBody} onChange={(e) => setPendingBody(e.target.value)}
              placeholder="코멘트 (선택, @멘션 가능)" autoFocus rows={4}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={savePending}
                style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: TOOL_COLOR, color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                저장
              </button>
              <button onClick={() => { setPending(null); setPendingBody('') }}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>
                취소
              </button>
            </div>
          </div>
        ) : selected ? (
          <ThreadPanel
            annotation={selected}
            currentUserId={user?.id}
            isPrivileged={isPrivileged}
            onClose={() => setSelectedId(null)}
            onDeleteAnnotation={() => removeAnnotation(selected.id)}
            onDeleteReply={(rid) => deleteReply(selected.id, rid).then(refresh).catch(() => {})}
            replyBody={replyBody}
            setReplyBody={setReplyBody}
            onSend={() => sendReply(selected.id)}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>주석 {annotations.length}개</div>
            {annotations.length === 0 && <p style={{ fontSize: 12, color: '#94a3b8' }}>위 도구로 이미지에 주석을 추가하세요.</p>}
            {annotations.map((a, i) => (
              <button key={a.id} onClick={() => setSelectedId(a.id)}
                style={{ textAlign: 'left', padding: 10, borderRadius: 8, border: '1px solid #f1f5f9', background: '#f8fafc', cursor: 'pointer' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>#{i + 1} · {a.kind} · {a.author_name}</div>
                {a.body && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.body}</div>}
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>답글 {a.replies.length}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function ThreadPanel({
  annotation, currentUserId, isPrivileged = false, onClose, onDeleteAnnotation, onDeleteReply, replyBody, setReplyBody, onSend,
}: {
  annotation: Annotation
  currentUserId?: string
  isPrivileged?: boolean  // admin/professor — 백엔드 _can_modify 와 일치
  onClose: () => void
  onDeleteAnnotation: () => void
  onDeleteReply: (replyId: string) => void
  replyBody: string
  setReplyBody: (v: string) => void
  onSend: () => void
}) {
  const canDelete = isPrivileged || (currentUserId && annotation.author_id === currentUserId)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{annotation.kind} 주석</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {canDelete && (
            <button onClick={onDeleteAnnotation} title="주석 삭제"
              style={{ padding: 4, borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444' }}>
              <Trash2 style={{ width: 15, height: 15 }} />
            </button>
          )}
          <button onClick={onClose} title="닫기"
            style={{ padding: 4, borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}>
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>
      </div>

      {annotation.body && (
        <div style={{ padding: 10, borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#059669' }}>{annotation.author_name}</div>
          <div style={{ fontSize: 13, color: '#0f172a', marginTop: 2, whiteSpace: 'pre-wrap' }}>{annotation.body}</div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {annotation.replies.map((r) => (
          <div key={r.id} style={{ padding: 8, borderRadius: 8, background: '#f8fafc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>{r.author_name}</span>
              {(isPrivileged || currentUserId === r.author_id) && (
                <button onClick={() => onDeleteReply(r.id)}
                  style={{ padding: 2, border: 'none', background: 'none', cursor: 'pointer', color: '#cbd5e1' }}>
                  <Trash2 style={{ width: 12, height: 12 }} />
                </button>
              )}
            </div>
            <div style={{ fontSize: 13, color: '#0f172a', marginTop: 2, whiteSpace: 'pre-wrap' }}>{r.body}</div>
          </div>
        ))}
        {annotation.replies.length === 0 && <p style={{ fontSize: 12, color: '#94a3b8' }}>아직 답글이 없습니다.</p>}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <input value={replyBody} onChange={(e) => setReplyBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSend() }}
          placeholder="답글 (@멘션 가능)"
          style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
        <button onClick={onSend}
          style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: TOOL_COLOR, color: '#fff', cursor: 'pointer' }}>
          <Send style={{ width: 15, height: 15 }} />
        </button>
      </div>
    </div>
  )
}
