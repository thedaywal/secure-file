import { lazy, Suspense, type ReactElement } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { PageLoader } from '@/components/common'
import { useAuth } from '@/context/AuthContext'
import { AppShell } from '@/layouts/AppShell'
import { AuthLayout } from '@/layouts/AuthLayout'
import { ViewerLayout } from '@/layouts/ViewerLayout'
import { ADMIN_BASE, adminPath } from '@/routes/navigation'

/* Route-level code splitting keeps the initial bundle small. */
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'))

const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'))
const FilesPage = lazy(() => import('@/pages/files/FilesPage'))
const ProtectFilePage = lazy(() => import('@/pages/files/ProtectFilePage'))
const FileDetailPage = lazy(() => import('@/pages/files/FileDetailPage'))
const SharedFilesPage = lazy(() => import('@/pages/sharing/SharedFilesPage'))
const AccessMonitoringPage = lazy(() => import('@/pages/monitoring/AccessMonitoringPage'))
const FileActivityPage = lazy(() => import('@/pages/monitoring/FileActivityPage'))
const RecipientActivityPage = lazy(() => import('@/pages/monitoring/RecipientActivityPage'))
const DevicesPage = lazy(() => import('@/pages/devices/DevicesPage'))
const NotificationsPage = lazy(() => import('@/pages/notifications/NotificationsPage'))
const WatermarksPage = lazy(() => import('@/pages/watermarks/WatermarksPage'))
const WatermarkDetailPage = lazy(() => import('@/pages/watermarks/WatermarkDetailPage'))
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage'))
const ProtectedFileViewerPage = lazy(() => import('@/pages/viewer/ProtectedFileViewerPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

/** Blocks the administrative area for unauthenticated visitors. */
function ProtectedRoute({ children }: { children: ReactElement }) {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'initialising') {
    return <PageLoader message="Verifying your session…" />
  }

  if (status !== 'authenticated') {
    return <Navigate to={adminPath('/login')} replace state={{ from: location.pathname + location.search }} />
  }

  return children
}

/** Keeps signed-in users out of the auth screens. */
function GuestRoute({ children }: { children: ReactElement }) {
  const { status } = useAuth()
  const location = useLocation()
  // The root path belongs to the public recipient viewer, so a signed-in user
  // who lands on an auth screen without a `from` goes to the console instead.
  const from = (location.state as { from?: string } | null)?.from ?? ADMIN_BASE

  if (status === 'initialising') {
    return <PageLoader message="Restoring your session…" />
  }

  if (status === 'authenticated') {
    return <Navigate to={from} replace />
  }

  return children
}

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public recipient experience — no owner dashboard access */}
        <Route element={<ViewerLayout />}>
          <Route path="/:token" element={<ProtectedFileViewerPage />} />
        </Route>

        {/* Authentication — mounted under the administrator console prefix */}
        <Route
          element={
            <GuestRoute>
              <AuthLayout />
            </GuestRoute>
          }
        >
          <Route path={adminPath('/login')} element={<LoginPage />} />
          <Route path={adminPath('/forgot-password')} element={<ForgotPasswordPage />} />
          <Route path={adminPath('/reset-password')} element={<ResetPasswordPage />} />
        </Route>

        {/* Administrative console — everything below is served under {ADMIN_BASE} */}
        <Route
          path={ADMIN_BASE}
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="files" element={<FilesPage />} />
          <Route path="files/new" element={<ProtectFilePage />} />
          <Route path="files/:fileId" element={<FileDetailPage />} />
          <Route path="sharing" element={<SharedFilesPage />} />
          <Route path="monitoring" element={<AccessMonitoringPage />} />
          <Route path="monitoring/files/:fileId" element={<FileActivityPage />} />
          <Route path="monitoring/recipients/:recipientUsername" element={<RecipientActivityPage />} />
          <Route path="devices" element={<DevicesPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="watermarks" element={<WatermarksPage />} />
          <Route path="watermarks/:watermarkId" element={<WatermarkDetailPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}
