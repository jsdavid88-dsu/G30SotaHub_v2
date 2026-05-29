// Phase 2.5 B — 이미지/영상 주석 API client.
// fetch + Bearer 토큰 (Hub 통합 인증).

export type AnnotationReply = {
  id: string
  annotation_id: string
  author_id: string
  author_name: string
  body: string
  created_at: string | null
}

export type AnnotationKind = 'pin' | 'box' | 'arrow' | 'freedraw'

export type Annotation = {
  id: string
  attachment_id: string
  author_id: string
  author_name: string
  kind: AnnotationKind
  geometry: Record<string, unknown>
  body: string | null
  timecode_ms: number | null
  created_at: string | null
  updated_at: string | null
  replies: AnnotationReply[]
}

function headers(): HeadersInit {
  const token = localStorage.getItem('token')
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const listAnnotations = (attachmentId: string) =>
  fetch(`/api/v1/attachments/${attachmentId}/annotations`, { headers: headers() }).then(handle<Annotation[]>)

export const createAnnotation = (
  attachmentId: string,
  payload: { kind: AnnotationKind; geometry: Record<string, unknown>; body?: string | null; timecode_ms?: number | null },
) =>
  fetch(`/api/v1/attachments/${attachmentId}/annotations`, {
    method: 'POST', headers: headers(), body: JSON.stringify(payload),
  }).then(handle<Annotation>)

export const updateAnnotation = (
  annId: string,
  payload: { geometry?: Record<string, unknown>; body?: string | null },
) =>
  fetch(`/api/v1/annotations/${annId}`, {
    method: 'PATCH', headers: headers(), body: JSON.stringify(payload),
  }).then(handle<Annotation>)

export const deleteAnnotation = (annId: string) =>
  fetch(`/api/v1/annotations/${annId}`, { method: 'DELETE', headers: headers() }).then(handle<void>)

export const createReply = (annId: string, body: string) =>
  fetch(`/api/v1/annotations/${annId}/replies`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ body }),
  }).then(handle<AnnotationReply>)

export const deleteReply = (annId: string, replyId: string) =>
  fetch(`/api/v1/annotations/${annId}/replies/${replyId}`, { method: 'DELETE', headers: headers() }).then(handle<void>)
