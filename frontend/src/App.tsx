import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { RoleProvider } from './contexts/RoleContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
// 엔트리 페이지(Login)와 인증 직후 랜딩(Dashboard)은 eager — 즉시 paint.
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'

// #17: 나머지 Hub 페이지는 route 단위 lazy — 메인 번들에서 분리.
const AuthCallback = lazy(() => import('./pages/AuthCallback'))
const Projects = lazy(() => import('./pages/Projects'))
const Profile = lazy(() => import('./pages/Profile'))
const DailyWrite = lazy(() => import('./pages/DailyWrite'))
const DailyFeed = lazy(() => import('./pages/DailyFeed'))
const Members = lazy(() => import('./pages/Members'))
const Calendar = lazy(() => import('./pages/Calendar'))
const Attendance = lazy(() => import('./pages/Attendance'))
const Weekly = lazy(() => import('./pages/Weekly'))
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'))
const Admin = lazy(() => import('./pages/Admin'))
const Notifications = lazy(() => import('./pages/Notifications'))
const MemberDetail = lazy(() => import('./pages/MemberDetail'))
const Sota = lazy(() => import('./pages/Sota'))
const Reports = lazy(() => import('./pages/Reports'))

// === VFX SOTA Monitor 흡수 (vfx-sota-monitor) ===
// #17: lazy load — VFX 서브트리(reactflow 포함)를 별도 async chunk 로 분리.
// /vfx/* 진입 시에만 로드 → Hub 메인 번들에서 제외.
const VfxApp = lazy(() => import('./vfx/App'))

function RouteFallback() {
  return (
    <div className="flex items-center justify-center h-64">
      <p className="text-gray-400 text-sm">로딩 중...</p>
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen"><p className="text-gray-400">로딩 중...</p></div>
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

function App() {
  return (
    <AuthProvider>
      <RoleProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<Suspense fallback={<RouteFallback />}><AuthCallback /></Suspense>} />

            {/* Hub Layout — VFX 를 자식으로 nest → 양쪽 사이드바(Hub + VFX) 동시 표시 */}
            <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/daily/write" element={<DailyWrite />} />
              <Route path="/daily/feed" element={<DailyFeed />} />
              <Route path="/members" element={<Members />} />
              <Route path="/members/:id" element={<MemberDetail />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/attendance" element={<Attendance />} />
              <Route path="/weekly" element={<Weekly />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/announcements" element={<Navigate to="/notifications" replace />} />
              <Route path="/sota" element={<Sota />} />
              <Route path="/reports" element={<Reports />} />

              {/* VFX SOTA Monitor — Hub Layout 의 main 안에 nested. Layout 의 Outlet Suspense 가 lazy 로딩 커버. */}
              <Route path="/vfx/*" element={<VfxApp />} />

              {/* fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </RoleProvider>
    </AuthProvider>
  )
}

export default App
