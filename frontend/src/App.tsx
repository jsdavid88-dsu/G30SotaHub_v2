import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { RoleProvider } from './contexts/RoleContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import AuthCallback from './pages/AuthCallback'
import Projects from './pages/Projects'
import Profile from './pages/Profile'
import DailyWrite from './pages/DailyWrite'
import DailyFeed from './pages/DailyFeed'
import Members from './pages/Members'
import Calendar from './pages/Calendar'
import Attendance from './pages/Attendance'
import Weekly from './pages/Weekly'
import ProjectDetail from './pages/ProjectDetail'
import Admin from './pages/Admin'
import Notifications from './pages/Notifications'
import MemberDetail from './pages/MemberDetail'
import Sota from './pages/Sota'
import Reports from './pages/Reports'

// === VFX SOTA Monitor 흡수 (vfx-sota-monitor) ===
import VfxApp from './vfx/App'

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
            <Route path="/auth/callback" element={<AuthCallback />} />

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

              {/* VFX SOTA Monitor — Hub Layout 의 main 안에 nested. 자체 Sidebar 만 가짐. */}
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
