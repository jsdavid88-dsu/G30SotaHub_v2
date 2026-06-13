// 범용 미디어 섹션 — 영상/이미지 업로드 + 프레임별 노트.
// owner_type 별로 재사용: 'sota_assignment'(배정 테스트 자료) / 'daily_block'(데일리 영상) 등.
// 영상 열고 "주석" 켜면 VideoAnnotator(프레임 ±1 스텝 + timecode 노트)가 동작.
import { useCallback, useEffect, useState } from 'react'
import AttachmentUploader, { AttachmentChip, type UploadedAttachment } from './AttachmentUploader'
import MediaViewer, { type MediaItem } from './MediaViewer'

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function MediaSection({
  ownerType,
  ownerId,
  canUpload = true,
  label = '테스트 자료',
  hint = '— 영상 열고 "주석"을 켜면 프레임별 노트',
}: {
  ownerType: string
  ownerId: string
  canUpload?: boolean
  label?: string
  hint?: string
}) {
  const [atts, setAtts] = useState<UploadedAttachment[]>([])
  const [viewer, setViewer] = useState<MediaItem | null>(null)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/v1/attachments?owner_type=${ownerType}&owner_id=${ownerId}`,
        { headers: authHeaders() },
      )
      if (res.ok) {
        const data = await res.json()
        setAtts(Array.isArray(data) ? data : [])
      }
    } catch { /* ignore */ } finally {
      setLoaded(true)
    }
  }, [ownerType, ownerId])

  useEffect(() => { load() }, [load])

  const toMedia = (a: UploadedAttachment): MediaItem => ({
    id: a.id,
    media_type: a.media_type,
    mime: a.mime,
    file_name: a.file_name,
    stream_url: a.stream_url,
    width: a.width,
    height: a.height,
    fps: a.fps ?? null,
    preview_status: a.preview_status ?? null,
  })

  // 자료도 없고 업로드 권한도 없으면 섹션 자체를 숨김 (데일리 피드 잡음 방지)
  if (loaded && atts.length === 0 && !canUpload) return null

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
      <p style={{
        fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 8,
        textTransform: 'uppercase' as const, letterSpacing: '0.05em',
      }}>
        {label} ({atts.length})
        <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: 8, letterSpacing: 0 }}>
          {hint}
        </span>
      </p>

      {atts.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: 6 }}>
          {atts.map((a) => (
            <AttachmentChip key={a.id} att={a} onClick={() => setViewer(toMedia(a))} />
          ))}
        </div>
      )}
      {loaded && atts.length === 0 && (
        <p style={{ fontSize: 12, color: '#cbd5e1', marginBottom: 6 }}>
          아직 업로드된 자료가 없습니다.
        </p>
      )}

      {canUpload && (
        <AttachmentUploader
          ownerType={ownerType}
          ownerId={ownerId}
          onUploaded={(att) => setAtts((prev) => [...prev, att])}
        />
      )}

      <MediaViewer item={viewer} onClose={() => setViewer(null)} />
    </div>
  )
}
