import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { UserInfo } from '../contexts/AuthContext'

export default function Login() {
  const { token, devLogin } = useAuth()
  const navigate = useNavigate()
  const [devRole, setDevRole] = useState<UserInfo['role']>('professor')

  useEffect(() => {
    if (token) navigate('/', { replace: true })
  }, [token, navigate])

  const handleDevLogin = async () => {
    await devLogin(devRole)
  }

  const handleGoogleLogin = () => {
    window.location.href = '/api/v1/auth/login'
  }

  return (
    <div className="min-h-screen flex font-body">
      {/* Left side — branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-sidebar relative overflow-hidden flex-col justify-between p-12">
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }}
        />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
            <span className="text-white font-bold text-lg">G</span>
          </div>
          <span className="text-white font-semibold text-lg tracking-tight">G30 SOTA Hub</span>
        </div>

        {/* Content — 사실 한 줄. 카피 없음. */}
        <div className="relative z-10">
          <h1 className="font-display text-[40px] text-white leading-tight tracking-tight">
            연구실 협업<span className="text-white/40"> · </span>SOTA 추적
          </h1>
        </div>

        {/* Footer */}
        <p className="relative z-10 text-sidebar-text/40 text-[12px]">
          G30SotaHub v2
        </p>

        {/* Decorative gradient orb */}
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-accent/20 rounded-full blur-[120px]" />
        <div className="absolute top-1/4 -left-16 w-64 h-64 bg-accent/10 rounded-full blur-[80px]" />
      </div>

      {/* Right side — form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-surface">
        <div className="w-full max-w-sm animate-fade-in">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
              <span className="text-white font-bold text-lg">G</span>
            </div>
            <span className="font-semibold text-lg tracking-tight text-text-primary">G30 SOTA Hub</span>
          </div>

          <h2 className="font-display text-2xl text-text-primary tracking-tight mb-8">로그인</h2>

          {/* Google Sign In */}
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-card border border-border rounded-xl text-[14px] font-medium text-text-primary hover:bg-card-hover hover:border-border/80 hover:shadow-sm transition-all duration-200"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Google 계정으로 로그인
          </button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center text-[12px]">
              <span className="bg-surface px-3 text-text-muted">or</span>
            </div>
          </div>

          {/* Dev login */}
          <div className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-text-secondary mb-1.5">역할 선택 (개발용)</label>
              <select
                value={devRole}
                onChange={(e) => setDevRole(e.target.value as UserInfo['role'])}
                className="w-full px-4 py-2.5 bg-card border border-border rounded-xl text-[14px] text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40 transition-all"
              >
                <option value="professor">교수 (Professor)</option>
                <option value="student">학생 (Student)</option>
                <option value="external">외부업체 (External)</option>
              </select>
            </div>
            <button
              onClick={handleDevLogin}
              className="w-full py-2.5 bg-accent text-white text-[14px] font-semibold rounded-xl hover:bg-accent-dark transition-colors shadow-sm"
            >
              Dev Sign In
            </button>
          </div>

          <p className="text-center text-[12px] text-text-muted mt-6">
            <span className="inline-block px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[11px] font-medium">DEV MODE</span>
            {' '}배포 시 제거됩니다
          </p>
        </div>
      </div>
    </div>
  )
}
