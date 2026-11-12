import { NavLink } from 'react-router-dom'
import { Lock, ShieldCheck, X } from 'lucide-react'

import { IconButton } from '@/components/common'
import { NAV_SECTIONS } from '@/routes/navigation'
import { cn } from '@/utils/cn'

export interface SidebarProps {
  /** Mobile drawer visibility. */
  open?: boolean
  onClose?: () => void
  className?: string
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-4 py-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-card">
        <Lock size={17} strokeWidth={2.4} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[15px] leading-5 font-semibold text-white">
          SecureFile
        </span>
        <span className="block truncate text-[11px] tracking-wide text-navy-500 uppercase">
          Protected delivery
        </span>
      </span>
    </div>
  )
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="scrollbar-slim flex-1 overflow-y-auto px-2.5 pb-4" aria-label="Main navigation">
      {NAV_SECTIONS.map((section) => (
        <div key={section.id} className="mt-4 first:mt-1">
          <p className="px-3 pb-1.5 text-[10.5px] font-semibold tracking-[0.09em] text-navy-500 uppercase">
            {section.title}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                      isActive
                        ? 'bg-brand-600/15 text-white'
                        : 'text-navy-500 hover:bg-white/5 hover:text-slate-200',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive ? (
                        <span
                          aria-hidden
                          className="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r bg-brand-400"
                        />
                      ) : null}
                      <item.icon
                        size={17}
                        strokeWidth={2}
                        className={cn('shrink-0', isActive ? 'text-brand-300' : 'text-navy-500')}
                      />
                      <span className="truncate">{item.label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function SecurityPosture() {
  return (
    <div className="mx-2.5 mb-3 rounded-lg border border-navy-700 bg-navy-850/80 p-3">
      <div className="flex items-center gap-2">
        <ShieldCheck size={15} className="text-success-500" />
        <p className="text-[12px] font-medium text-slate-200">Protection active</p>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-navy-500">
        AES-256-GCM at rest · permanent recipient watermarking enforced · access audit logging on.
      </p>
    </div>
  )
}

export function Sidebar({ open = false, onClose, className }: SidebarProps) {
  return (
    <>
      {/* Desktop rail */}
      <aside
        className={cn(
          'hidden w-60 shrink-0 flex-col border-r border-navy-800 bg-navy-900 lg:flex',
          className,
        )}
      >
        <Brand />
        <SidebarNav />
        <SecurityPosture />
      </aside>

      {/* Mobile drawer */}
      <div
        className={cn(
          'fixed inset-0 z-50 lg:hidden',
          open ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        aria-hidden={!open}
      >
        <div
          className={cn(
            'absolute inset-0 bg-navy-950/50 transition-opacity',
            open ? 'opacity-100' : 'opacity-0',
          )}
          onClick={onClose}
        />
        <aside
          className={cn(
            'absolute inset-y-0 left-0 flex w-64 flex-col bg-navy-900 shadow-pop transition-transform duration-200',
            open ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="flex items-center justify-between pr-2">
            <Brand />
            <IconButton
              label="Close navigation"
              size="sm"
              className="text-navy-500 hover:bg-white/5 hover:text-white"
              onClick={onClose}
            >
              <X size={16} />
            </IconButton>
          </div>
          <SidebarNav onNavigate={onClose} />
          <SecurityPosture />
        </aside>
      </div>
    </>
  )
}
