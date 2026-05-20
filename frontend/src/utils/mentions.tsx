// 텍스트의 @user 부분을 색상 강조. mention 알림 시각화.
import type { ReactNode } from 'react'

const MENTION_RE = /(@[A-Za-z0-9가-힣._@-]+)/g

export function renderWithMentions(text: string, color: string = '#4f46e5'): ReactNode[] {
  if (!text) return [text]
  const parts = text.split(MENTION_RE)
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      return (
        <span
          key={i}
          style={{
            color,
            fontWeight: 600,
            background: 'rgba(79,70,229,0.08)',
            padding: '0 4px',
            borderRadius: 4,
          }}
        >
          {part}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}
