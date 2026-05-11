import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import AuthPage from './pages/AuthPage'
import DashboardLayout from './components/DashboardLayout'
import Dashboard from './pages/Dashboard'
import Journal from './pages/Journal'
import Skills from './pages/Skills'
import SkillGap from './pages/SkillGap'
import InterviewPrep from './pages/InterviewPrep'
import CVScanner from './pages/CVScanner'
import Experiences from './pages/Experiences'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <AppLoader />
  if (!user) return <Navigate to="/auth" replace />
  return children
}

function AppLoader() {
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary)',
    }}>
      <div className="loader" />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/" element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="journal" element={<Journal />} />
          <Route path="skills" element={<Skills />} />
          <Route path="skill-gap" element={<SkillGap />} />
          <Route path="interview-prep" element={<InterviewPrep />} />
          <Route path="cv-scanner" element={<CVScanner />} />
          <Route path="experiences" element={<Experiences />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
