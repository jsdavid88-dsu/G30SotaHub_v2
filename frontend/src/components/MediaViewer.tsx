// 이미지/영상 풀스크린 뷰어 (Lightbox).
// - 이미지: 원본 크기 (max 화면), 클릭으로 닫기
// - 영상: <video controls>, range request 자동 활용 (브라우저 native)
// - ESC 키로 닫기
import { useEffect, useState } from 'react'
import { X, PenLine } from 'lucide-react'
import ImageAnnotator from './ImageAnnotator'
import VideoAnnotator from './VideoAnnotator'

export type MediaItem = {
  id: string
  media_type: 'image' | 'video' | string
  mime?: string | null
  file_name?: string | null
  stream_url: string
  width?: number | null
  height?: number | null
}

type Props = {
  item: MediaItem | null
  onClose: () => void
  // 이미지 주석(그리기+코멘트) 활성화 — 기본 true. id 가 attachment UUID 일 때만 동작.
  annotatable?: boolean
}

export default function MediaViewer({ item, onClose, annotatable = true }: Props) {
  const [annotate, setAnnotate] = useState(false)

  useEffect(() => {
    if (!item) return
    // 주석 모드에서는 ESC 가 그리기 취소 용도일 수 있어 뷰어 닫기는 비활성 (토글로만)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !annotate) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [item, onClose, annotate])

  // 뷰어 닫힐 때 주석 모드 리셋
  useEffect(() => { if (!item) setAnnotate(false) }, [item])

  if (!item) return null

  const canAnnotate = annotatable && (item.media_type === 'image' || item.media_type === 'video')

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(15,23,42,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onClose() }}
        title="닫기 (ESC)"
        style={{
          position: 'absolute', top: 16, right: 16, zIndex: 1,
          width: 40, height: 40, borderRadius: 99,
          background: 'rgba(255,255,255,0.1)',
          color: '#fff', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <X style={{ width: 20, height: 20 }} />
      </button>

      {/* 주석 모드 토글 (이미지만) */}
      {canAnnotate && (
        <button
          onClick={(e) => { e.stopPropagation(); setAnnotate((v) => !v) }}
          title="주석 모드 (그리기 + 코멘트)"
          style={{
            position: 'absolute', top: 16, right: 64, zIndex: 1,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            height: 40, padding: '0 14px', borderRadius: 99,
            background: annotate ? '#10b981' : 'rgba(255,255,255,0.1)',
            color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}
        >
          <PenLine style={{ width: 16, height: 16 }} />
          {annotate ? '주석 끄기' : '주석'}
        </button>
      )}
      {item.file_name && (
        <div style={{
          position: 'absolute', top: 16, left: 16, zIndex: 1,
          padding: '6px 14px', borderRadius: 8,
          background: 'rgba(255,255,255,0.1)', color: '#fff',
          fontSize: 13,
        }}>
          {item.file_name}
        </div>
      )}

      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: '95vw', maxHeight: '90vh' }}>
        {item.media_type === 'image' && annotate ? (
          <ImageAnnotator attachmentId={item.id} streamUrl={item.stream_url} fileName={item.file_name} />
        ) : item.media_type === 'video' && annotate ? (
          <VideoAnnotator attachmentId={item.id} streamUrl={item.stream_url} />
        ) : item.media_type === 'image' ? (
          <img
            src={item.stream_url}
            alt={item.file_name || ''}
            style={{ maxWidth: '95vw', maxHeight: '90vh', objectFit: 'contain', display: 'block' }}
          />
        ) : item.media_type === 'video' ? (
          <video
            src={item.stream_url}
            controls
            autoPlay
            style={{ maxWidth: '95vw', maxHeight: '90vh' }}
          />
        ) : (
          <div style={{ color: '#fff', padding: 32, background: 'rgba(255,255,255,0.05)', borderRadius: 12 }}>
            이 형식은 미리보기를 지원하지 않습니다.
          </div>
        )}
      </div>
    </div>
  )
}
