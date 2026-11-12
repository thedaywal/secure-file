import { Loader2 } from 'lucide-react'

import { cn } from '@/utils/cn'

export interface SpinnerProps {
  size?: number
  className?: string
  label?: string
}

export function Spinner({ size = 18, className, label = 'Loading' }: SpinnerProps) {
  return (
    <span role="status" aria-label={label} className={cn('inline-flex text-brand-600', className)}>
      <Loader2 aria-hidden size={size} className="animate-spin" />
      <span className="sr-only">{label}</span>
    </span>
  )
}

/** Full-page loading state used for route-level suspense. */
export function PageLoader({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <Spinner size={26} />
      <p className="text-[13px] text-ink-muted">{message}</p>
    </div>
  )
}
