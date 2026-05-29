// Phase 2.5 — 이미지/영상 업로드 위젯.
// 단일 또는 다중 파일 업로드 + 진행률 표시.
// owner_type / owner_id 받음 → 백엔드가 storage 에 저장.
import { useRef, useState } from 'react'
import { Paperclip, X, Loader2 } from 'lucide-react'

export type UploadedAttachment = {
  id: string
  media_type: string
  mime: string | null
  file_name: string | null
  size_bytes: number | null
  width: number | null
  height: number | null
  duration_sec: number | null
  fps?: number | null
  preview_status?: string | null
  stream_url: string
  thumbnail_url: string | null
  created_at: string | null
}

type Props = {
  ownerType: string  // 'project_message', 'daily_block', etc
  ownerId: string    // UUID
  onUploaded: (att: UploadedAttachment) => void
  disabled?: boolean
}

const ACCEPT = 'image/*,video/*'

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function AttachmentUploader({ ownerType, ownerId, onUploaded, disabled }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState<string[]>([])  // filenames
  const [error, setError] = useState<string | null>(null)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError(null)
    for (const file of Array.from(files)) {
      setUploading((prev) => [...prev, file.name])
      try {
        const form = new FormData()
        form.append('file', file)
        form.append('owner_type', ownerType)
        form.append('owner_id', ownerId)
        const res = await fetch('/api/v1/attachments', {
          method: 'POST',
          headers: authHeaders(),
          body: form,
        })
        if (!res.ok) {
          const text = await res.text()
          throw new Error(`업로드 실패 (${res.status}): ${text.slice(0, 200)}`)
        }
        const att: UploadedAttachment = await res.json()
        onUploaded(att)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setUploading((prev) => prev.filter((n) => n !== file.name))
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button
        onClick={(e) => { e.preventDefault(); fileRef.current?.click() }}
        disabled={disabled}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
          background: 'transparent', color: '#64748b',
          border: '1px solid #e2e8f0', cursor: disabled ? 'not-allowed' : 'pointer',
          width: 'fit-content',
          opacity: disabled ? 0.5 : 1,
        }}
        title="이미지/영상 첨부"
      >
        <Paperclip style={{ width: 12, height: 12 }} />
        이미지/영상 첨부
      </button>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        multiple
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
        style={{ display: 'none' }}
      />

      {uploading.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {uploading.map((name) => (
            <div key={name} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 11, color: '#4f46e5',
              padding: '3px 8px', background: '#eef2ff', borderRadius: 5,
              width: 'fit-content',
            }}>
              <Loader2 style={{ width: 11, height: 11, animation: 'spin 0.8s linear infinite' }} />
              <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                업로드 중: {name}
              </span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 11, color: '#dc2626' }}>{error}</div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ─── 첨부 thumb 카드 (인라인 표시용) ────────────────────────────────────

export function AttachmentChip({
  att,
  onClick,
  onRemove,
}: {
  att: UploadedAttachment | (UploadedAttachment & { _local?: boolean })
  onClick?: () => void
  onRemove?: () => void
}) {
  const isVideo = att.media_type === 'video'
  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 6px', borderRadius: 8,
        background: '#f8fafc', border: '1px solid #e2e8f0',
        cursor: onClick ? 'pointer' : 'default',
        marginRight: 6, marginBottom: 6,
      }}
    >
      {att.thumbnail_url ? (
        <img
          src={att.thumbnail_url}
          alt={att.file_name || ''}
          style={{
            width: 44, height: 44, borderRadius: 5,
            objectFit: 'cover', flexShrink: 0,
            background: '#e2e8f0',
          }}
        />
      ) : (
        <div style={{
          width: 44, height: 44, borderRadius: 5,
          background: '#e2e8f0', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, color: '#64748b',
        }}>
          {isVideo ? '🎬' : '📎'}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{
          fontSize: 11, fontWeight: 500, color: '#0f172a',
          maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {att.file_name || 'untitled'}
        </span>
        <span style={{ fontSize: 10, color: '#94a3b8' }}>
          {isVideo
            ? `영상${att.duration_sec ? ` · ${Math.round(att.duration_sec)}초` : ''}`
            : '이미지'}
          {att.size_bytes ? ` · ${formatSize(att.size_bytes)}` : ''}
        </span>
      </div>
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          title="제거"
          style={{
            width: 18, height: 18, borderRadius: '50%',
            background: '#fee2e2', color: '#dc2626',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, marginLeft: 4,
          }}
        >
          <X style={{ width: 10, height: 10 }} />
        </button>
      )}
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`
}
