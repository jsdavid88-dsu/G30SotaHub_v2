// 이미지/영상 풀스크린 뷰어 (Lightbox).
// - 이미지: 원본 크기 (max 화면), 클릭으로 닫기
// - 영상: <video controls>, range request 자동 활용 (브라우저 native)
// - ESC 키로 닫기
import { useEffect } from 'react'
import { X } from 'lucide-react'

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
}

export default function MediaViewer({ item, onClose }: Props) {
  useEffect(() => {
    if (!item) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [item, onClose])

  if (!item) return null

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
        {item.media_type === 'image' ? (
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
