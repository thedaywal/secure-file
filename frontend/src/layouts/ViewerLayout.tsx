import { Outlet } from 'react-router-dom'
import { Lock, ShieldCheck } from 'lucide-react'

/**
 * Public shell for the recipient experience. Intentionally contains no
 * administrative navigation — recipients never see the owner dashboard.
 */
export function ViewerLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white">
              <Lock size={15} strokeWidth={2.4} />
            </span>
            <div>
              <p className="text-[14px] leading-4 font-semibold text-ink">SecureFile</p>
              <p className="text-[11px] leading-4 text-ink-muted">Protected file delivery</p>
            </div>
          </div>
          <span className="hidden items-center gap-1.5 rounded-full bg-success-50 px-2.5 py-1 text-[11.5px] font-medium text-success-700 ring-1 ring-success-200 ring-inset sm:inline-flex">
            <ShieldCheck size={13} />
            Secure connection
          </span>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  )
}
