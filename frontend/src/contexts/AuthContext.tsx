import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '../api/client'

export interface UserInfo {
  id: string
  email: string
  name: string
  role: 'professor' | 'student' | 'external' | 'admin'
  profile_image_url?: string | null
  google_calendar_connected?: boolean
}

interface AuthContextType {
  user: UserInfo | null
  token: string | null
  loading: boolean
  logout: () => void
  devLogin: (role: UserInfo['role']) => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  loading: true,
  logout: () => {},
  devLogin: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('token')
    if (!stored) {
      setLoading(false)
      return
    }
    setToken(stored)
    // Fetch real user info from /auth/me
    api.auth.me()
      .then((data: any) => {
        setUser({
          id: data.id,
          email: data.email,
          name: data.name,
          role: data.role,
          profile_image_url: data.profile_image_url,
        })
      })
      .catch(() => {
        // Token invalid or expired
        localStorage.removeItem('token')
        setToken(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const logout = () => {
    localStorage.removeItem('token')
    setUser(null)
    setToken(null)
    window.location.href = '/login'
  }

  const devLogin = async (role: UserInfo['role']) => {
    const emailMap: Record<UserInfo['role'], string> = {
      admin: 'admin@test.com',                  // seed.py 의 admin user
      professor: 'professor@test.com',
      student: 'student1@test.com',
      external: 'external@company.com',
    }
    try {
      const res = await api.auth.devLogin(emailMap[role])
      localStorage.setItem('token', res.access_token)
      setToken(res.access_token)
      setUser({
        id: res.user.id,
        email: res.user.email,
        name: res.user.name,
        role: res.user.role,
        profile_image_url: res.user.profile_image_url,
      })
    } catch (e) {
      console.error('Dev login failed:', e)
    }
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, logout, devLogin }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
