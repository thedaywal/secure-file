import { Link } from 'react-router-dom'
import { Compass, Lock } from 'lucide-react'

import { Button } from '@/components/common'
import { useAuth } from '@/context/AuthContext'
import { ADMIN_BASE } from '@/routes/navigation'

export default function NotFoundPage() {
  const { status } = useAuth()

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-canvas px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
        <Lock size={20} strokeWidth={2.4} />
      </span>
      <div className="space-y-2">
        <p className="font-mono text-[12px] tracking-wide text-ink-muted uppercase">
          404 · route not found
        </p>
        <h1 className="text-xl font-semibold text-ink">This page is not available</h1>
        <p className="mx-auto max-w-md text-[13px] leading-5 text-ink-muted">
          The link may have expired, or the resource was removed. Protected resources require an
          active authenticated session.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button leftIcon={<Compass size={15} />} onClick={() => window.history.back()}>
          Go back
        </Button>
        {status === 'authenticated' ? (
          <Link
            to={ADMIN_BASE}
            className="inline-flex h-9 items-center rounded-lg border border-line-strong bg-surface px-3.5 text-sm font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50/60"
          >
            Back to dashboard
          </Link>
        ) : null}
      </div>
    </div>
  )
}
