import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { Sidebar } from '@/layouts/Sidebar'
import { Topbar } from '@/layouts/Topbar'
import { notificationsService } from '@/services/notifications.service'

/**
 * Authenticated application shell: navy navigation rail, sticky topbar and the
 * scrollable workspace. The sidebar collapses into a drawer below `lg`.
 */
export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const location = useLocation()

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  useEffect(() => {
    let active = true
    notificationsService
      .unreadCount()
      .then((count) => {
        if (active) setUnreadCount(count)
      })
      .catch(() => {
        /* the badge is non-critical */
      })
    return () => {
      active = false
    }
  }, [location.pathname])

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenSidebar={() => setSidebarOpen(true)} unreadCount={unreadCount} />

        <main className="scrollbar-slim flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 sm:py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
