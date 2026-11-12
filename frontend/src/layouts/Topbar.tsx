import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ChevronDown,
  CircleUserRound,
  LogOut,
  Menu,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  BellRing,
} from 'lucide-react'

import { Badge, Dropdown, IconButton, Input } from '@/components/common'
import { useAuth } from '@/context/AuthContext'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { adminPath } from '@/routes/navigation'
import { env } from '@/config/env'
import { cn } from '@/utils/cn'

export interface TopbarProps {
  onOpenSidebar: () => void
  unreadCount?: number
  className?: string
}

export function Topbar({ onOpenSidebar, unreadCount = 0, className }: TopbarProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  useDocumentTitle(undefined)

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = query.trim()
    navigate(trimmed ? adminPath(`/files?search=${encodeURIComponent(trimmed)}`) : adminPath('/files'))
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface/95 px-3 backdrop-blur sm:px-5',
        className,
      )}
    >
      <IconButton
        label="Open navigation"
        size="md"
        className="lg:hidden"
        onClick={onOpenSidebar}
      >
        <Menu size={18} />
      </IconButton>

      <form onSubmit={handleSearch} className="hidden max-w-sm flex-1 sm:block">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search files, recipients, access logs…"
          leftIcon={<Search size={15} />}
          aria-label="Global search"
        />
      </form>

      <div className="flex-1 sm:hidden" />

      <div className="ml-auto flex items-center gap-1.5">
        {env.enableMockFallback ? (
          <Badge tone="warning" size="sm" className="hidden md:inline-flex">
            Mock fallback on
          </Badge>
        ) : null}

        <span className="hidden items-center gap-1.5 rounded-full bg-success-50 px-2.5 py-1 text-[11.5px] font-medium text-success-700 ring-1 ring-success-200 ring-inset xl:inline-flex">
          <ShieldCheck size={13} />
          Session encrypted
        </span>

        <Link
          to={adminPath('/notifications')}
          className="relative flex size-9 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-navy-900/5 hover:text-ink"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        >
          <BellRing size={18} />
          {unreadCount > 0 ? (
            <span className="absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] leading-4 font-semibold text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
        </Link>

        <Dropdown
          trigger={({ open, toggle }) => (
            <button
              type="button"
              onClick={toggle}
              aria-haspopup="menu"
              aria-expanded={open}
              className={cn(
                'flex items-center gap-2 rounded-lg py-1 pr-2 pl-1 transition-colors hover:bg-navy-900/5',
                open && 'bg-navy-900/5',
              )}
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-navy-900 text-[12px] font-semibold text-white">
                {user?.fullName
                  ?.split(' ')
                  .slice(0, 2)
                  .map((part) => part.charAt(0))
                  .join('') ?? '?'}
              </span>
              <span className="hidden min-w-0 text-left md:block">
                <span className="block max-w-[150px] truncate text-[12.5px] leading-4 font-medium text-ink">
                  {user?.fullName ?? 'Account'}
                </span>
                <span className="block max-w-[150px] truncate text-[11px] leading-4 text-ink-muted">
                  {user?.organization ?? user?.email ?? ''}
                </span>
              </span>
              <ChevronDown size={14} className="hidden text-ink-muted md:block" />
            </button>
          )}
          items={[
            {
              id: 'profile',
              label: 'Account settings',
              icon: <CircleUserRound size={15} />,
              onSelect: () => navigate(adminPath('/settings')),
            },
            {
              id: 'security',
              label: 'Security preferences',
              icon: <SettingsIcon size={15} />,
              onSelect: () => navigate(adminPath('/settings?tab=security')),
            },
            {
              id: 'signout',
              label: 'Sign out',
              icon: <LogOut size={15} />,
              tone: 'danger',
              separated: true,
              onSelect: () => {
                void logout().then(() => navigate(adminPath('/login'), { replace: true }))
              },
            },
          ]}
        />
      </div>
    </header>
  )
}
