// 미디어 URL 에 인증 토큰 부착.
// <img>/<video src> 는 Authorization 헤더를 못 보내므로 stream/thumbnail 은 ?token= 쿼리 사용
// (백엔드 get_current_user_media 가 헤더 또는 쿼리 둘 다 허용).
export function authMediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  const token = localStorage.getItem('token')
  if (!token) return url
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
}
