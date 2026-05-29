// Phase 2.5 C — 영상 주석 (타임코드 + 그리기 + 코멘트 스레드).
// - 영상 특정 시점(timecode_ms)에 도형(핀/박스/자유선) + 코멘트
// - 그리기 시 자동 일시정지 → 현재 시점에 주석 묶음
// - 타임라인 마커 클릭 → 해당 시점 seek + 도형 표시
// geometry 는 0~1 비율 좌표 (이미지와 동일). ThreadPanel 은 ImageAnnotator 재사용.
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPE } from 'react'
import { MousePointer2, MapPin, Square, PenLine, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { ThreadPanel } from './ImageAnnotator'
import {
  listAnnotations, createAnnotation, deleteAnnotation, createReply, deleteReply,
  type Annotation, type AnnotationKind,
} from '../api/annotations'

type Tool = 'view' | 'pin' | 'box' | 'freedraw'
type Draft =
  | { kind: 'box'; x: number; y: number; w: number; h: number }
  | { kind: 'freedraw'; points: [number, number][] }
  | null
type Pending = { kind: AnnotationKind; geometry: Record<string, number | number[][]>; timecode_ms: number } | null

const TOOL_COLOR = '#10b981'

function msLabel(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export default function VideoAnnotator({
  attachmentId, streamUrl, fps,
}: {
  attachmentId: string
  streamUrl: string
  fps?: number | null
}) {
  const effectiveFps = fps && fps > 0 ? fps : 30
  const { user } = useAuth()
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [tool, setTool] = useState<Tool>('view')
  const [draft, setDraft] = useState<Draft>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [pendingBody, setPendingBody] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [currentMs, setCurrentMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const draftTimecode = useRef(0)

  const refresh = useCallback(() => {
    listAnnotations(attachmentId).then(setAnnotations).catch(() => {})
  }, [attachmentId])
  useEffect(() => { refresh() }, [refresh])

  const toRatio = useCallback((e: RPE): { x: number; y: number } => {
    const rect = surfaceRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 }
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    }
  }, [])

  const pauseVideo = () => { videoRef.current?.pause() }

  // 1프레임씩 앞/뒤 (정밀 프레임 네비). currentTime = n/fps 로 가장 가까운 프레임 seek.
  const stepFrame = (dir: 1 | -1) => {
    const v = videoRef.current
    if (!v) return
    v.pause()
    const dt = 1 / effectiveFps
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + dir * dt))
  }
  const currentFrame = Math.round((currentMs / 1000) * effectiveFps)

  const onPointerDown = (e: RPE) => {
    if (tool === 'view' || pending) return
    e.preventDefault()
    pauseVideo()
    draftTimecode.current = Math.round((videoRef.current?.currentTime || 0) * 1000)
    const p = toRatio(e)
    if (tool === 'pin') {
      setPending({ kind: 'pin', geometry: { x: p.x, y: p.y }, timecode_ms: draftTimecode.current })
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
      setPending({ kind: 'box', geometry: { x: draft.x, y: draft.y, w: draft.w, h: draft.h }, timecode_ms: draftTimecode.current })
      setPendingBody('')
    } else if (draft.kind === 'freedraw' && draft.points.length > 2) {
      setPending({ kind: 'freedraw', geometry: { points: draft.points }, timecode_ms: draftTimecode.current })
      setPendingBody('')
    }
    setDraft(null)
    dragStart.current = null
  }

  const savePending = async () => {
    if (!pending) return
    try {
      await createAnnotation(attachmentId, {
        kind: pending.kind, geometry: pending.geometry, body: pendingBody.trim() || null, timecode_ms: pending.timecode_ms,
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

  // 주석 선택 → 해당 시점으로 seek
  const selectAnnotation = (a: Annotation) => {
    setSelectedId(a.id)
    if (videoRef.current && a.timecode_ms != null) {
      videoRef.current.pause()
      videoRef.current.currentTime = a.timecode_ms / 1000
    }
  }

  const selected = annotations.find((a) => a.id === selectedId) || null
  const pct = (v: number) => `${v * 100}%`

  // 선택된 주석의 도형만 overlay 표시 (현재 시점 프레임 위)
  const showShape = selected

  const TOOLS: { id: Tool; icon: typeof MapPin; label: string }[] = [
    { id: 'view', icon: MousePointer2, label: '보기' },
    { id: 'pin', icon: MapPin, label: '핀' },
    { id: 'box', icon: Square, label: '박스' },
    { id: 'freedraw', icon: PenLine, label: '자유선' },
  ]

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', maxWidth: '95vw', maxHeight: '90vh' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        {/* 툴바 */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {TOOLS.map((t) => {
            const active = tool === t.id
            return (
              <button key={t.id} onClick={() => { setTool(t.id); setPending(null) }} title={t.label}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px',
                  borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: '1px solid', borderColor: active ? TOOL_COLOR : 'rgba(255,255,255,0.2)',
                  background: active ? TOOL_COLOR : 'rgba(255,255,255,0.08)', color: active ? '#fff' : '#e2e8f0',
                }}>
                <t.icon style={{ width: 13, height: 13 }} /> {t.label}
              </button>
            )
          })}
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginLeft: 4 }}>
            {tool === 'view' ? '재생 후 마커 클릭' : `${msLabel(currentMs)} 시점에 그리기 (자동 일시정지)`}
          </span>
        </div>

        {/* 영상 + overlay */}
        <div ref={surfaceRef} style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
          <video
            ref={videoRef} src={streamUrl} controls
            onTimeUpdate={(e) => setCurrentMs(Math.round((e.target as HTMLVideoElement).currentTime * 1000))}
            onLoadedMetadata={(e) => setDurationMs(Math.round((e.target as HTMLVideoElement).duration * 1000))}
            style={{ maxWidth: '70vw', maxHeight: '74vh', display: 'block' }}
          />
          {/* 그리기 overlay — tool=view 면 pointerEvents none (영상 컨트롤 사용) */}
          <div
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
            style={{
              position: 'absolute', inset: 0,
              pointerEvents: tool === 'view' ? 'none' : 'auto',
              cursor: tool === 'view' ? 'default' : 'crosshair', touchAction: 'none',
            }}
          >
            <svg viewBox="0 0 100 100" preserveAspectRatio="none"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              {showShape && selected.kind === 'box' && (() => {
                const g = selected.geometry as { x: number; y: number; w: number; h: number }
                return <rect x={g.x * 100} y={g.y * 100} width={g.w * 100} height={g.h * 100}
                  fill="rgba(16,185,129,0.15)" stroke={TOOL_COLOR} strokeWidth={0.4} vectorEffect="non-scaling-stroke" />
              })()}
              {showShape && selected.kind === 'freedraw' && (() => {
                const pts = ((selected.geometry as { points: [number, number][] }).points || [])
                return <path d={pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0] * 100} ${p[1] * 100}`).join(' ')}
                  fill="none" stroke={TOOL_COLOR} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
              })()}
              {draft?.kind === 'box' && (
                <rect x={draft.x * 100} y={draft.y * 100} width={draft.w * 100} height={draft.h * 100}
                  fill="rgba(16,185,129,0.1)" stroke={TOOL_COLOR} strokeWidth={0.4} strokeDasharray="1 1" vectorEffect="non-scaling-stroke" />
              )}
              {draft?.kind === 'freedraw' && (
                <path d={draft.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0] * 100} ${p[1] * 100}`).join(' ')}
                  fill="none" stroke={TOOL_COLOR} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
              )}
            </svg>
            {/* 선택된 핀 */}
            {showShape && selected.kind === 'pin' && (() => {
              const g = selected.geometry as { x: number; y: number }
              return <div style={{
                position: 'absolute', left: pct(g.x), top: pct(g.y), transform: 'translate(-50%, -100%)',
                width: 22, height: 22, borderRadius: '50% 50% 50% 0', rotate: '-45deg',
                background: '#059669', border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
              }} />
            })()}
            {/* pending pin */}
            {pending?.kind === 'pin' && (
              <div style={{
                position: 'absolute', left: pct(pending.geometry.x as number), top: pct(pending.geometry.y as number),
                transform: 'translate(-50%, -100%)', width: 22, height: 22, borderRadius: '50% 50% 50% 0',
                rotate: '-45deg', background: '#f59e0b', border: '2px solid #fff',
              }} />
            )}
          </div>
        </div>

        {/* 프레임 정밀 네비게이션 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => stepFrame(-1)} title="이전 프레임"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#e2e8f0', cursor: 'pointer', fontSize: 12 }}>
            <ChevronLeft style={{ width: 14, height: 14 }} /> 1프레임
          </button>
          <button onClick={() => stepFrame(1)} title="다음 프레임"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#e2e8f0', cursor: 'pointer', fontSize: 12 }}>
            1프레임 <ChevronRight style={{ width: 14, height: 14 }} />
          </button>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontVariantNumeric: 'tabular-nums' }}>
            프레임 {currentFrame} · {msLabel(currentMs)} · {effectiveFps}fps{!fps ? ' (추정)' : ''}
          </span>
        </div>

        {/* 타임라인 마커 */}
        <div style={{ position: 'relative', height: 24, background: 'rgba(255,255,255,0.08)', borderRadius: 6 }}>
          {durationMs > 0 && annotations.map((a) => {
            if (a.timecode_ms == null) return null
            return (
              <button key={a.id} title={`${msLabel(a.timecode_ms)} — ${a.body || a.kind}`}
                onClick={() => selectAnnotation(a)}
                style={{
                  position: 'absolute', top: 3, left: `${(a.timecode_ms / durationMs) * 100}%`,
                  transform: 'translateX(-50%)', width: 12, height: 18, padding: 0,
                  borderRadius: 3, border: '1px solid #fff',
                  background: a.id === selectedId ? '#059669' : TOOL_COLOR, cursor: 'pointer',
                }} />
            )
          })}
        </div>
      </div>

      {/* 우측 패널 */}
      <div style={{
        width: 320, flexShrink: 0, background: '#fff', borderRadius: 12, padding: 16,
        display: 'flex', flexDirection: 'column', maxHeight: '86vh', overflow: 'hidden',
      }}>
        {pending ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
              새 주석 ({pending.kind}) · {msLabel(pending.timecode_ms)}
            </div>
            <textarea value={pendingBody} onChange={(e) => setPendingBody(e.target.value)}
              placeholder="코멘트 (선택, @멘션 가능)" autoFocus rows={4}
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={savePending}
                style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: TOOL_COLOR, color: '#fff', fontWeight: 600, cursor: 'pointer' }}>저장</button>
              <button onClick={() => { setPending(null); setPendingBody('') }}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>취소</button>
            </div>
          </div>
        ) : selected ? (
          <ThreadPanel
            annotation={selected} currentUserId={user?.id}
            onClose={() => setSelectedId(null)}
            onDeleteAnnotation={() => removeAnnotation(selected.id)}
            onDeleteReply={(rid) => deleteReply(selected.id, rid).then(refresh).catch(() => {})}
            replyBody={replyBody} setReplyBody={setReplyBody} onSend={() => sendReply(selected.id)}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>주석 {annotations.length}개</div>
            {annotations.length === 0 && <p style={{ fontSize: 12, color: '#94a3b8' }}>영상을 재생하다 도구를 골라 특정 순간에 주석을 다세요.</p>}
            {[...annotations].sort((a, b) => (a.timecode_ms || 0) - (b.timecode_ms || 0)).map((a) => (
              <button key={a.id} onClick={() => selectAnnotation(a)}
                style={{ textAlign: 'left', padding: 10, borderRadius: 8, border: '1px solid #f1f5f9', background: '#f8fafc', cursor: 'pointer' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>
                  {a.timecode_ms != null ? msLabel(a.timecode_ms) : '—'} · {a.kind} · {a.author_name}
                </div>
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
