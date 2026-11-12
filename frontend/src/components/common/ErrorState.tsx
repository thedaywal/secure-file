import { AlertOctagon, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react'

import { Button } from '@/components/common/Button'
import { cn } from '@/utils/cn'
import type { ApiError } from '@/types'

function iconFor(error?: ApiError | null) {
  if (!error) return AlertOctagon
  if (error.status === 0) return WifiOff
  if (error.status === 401 || error.status === 403) return ShieldAlert
  return AlertOctagon
}

export interface ErrorStateProps {
  error?: ApiError | null
  title?: string
  description?: string
  onRetry?: () => void
  retryLabel?: string
  className?: string
  compact?: boolean
}

/** Standard failure surface: never leaks raw server payloads to the user. */
export function ErrorState({
  error,
  title,
  description,
  onRetry,
  retryLabel = 'Try again',
  className,
  compact,
}: ErrorStateProps) {
  const Icon = iconFor(error)
  const resolvedTitle =
    title ?? (error?.status === 0 ? 'Unable to reach the API' : 'Something went wrong')
  const resolvedDescription =
    description ??
    error?.message ??
    'The request could not be completed. Please try again in a moment.'

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-6 py-8' : 'gap-3 px-6 py-14',
        className,
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-danger-50 text-danger-600">
        <Icon size={20} />
      </span>
      <div className="space-y-1">
        <h3 className="text-[14px] font-semibold text-ink">{resolvedTitle}</h3>
        <p className="mx-auto max-w-md text-[12.5px] leading-5 text-ink-muted">
          {resolvedDescription}
        </p>
      </div>
      {error?.status ? (
        <p className="font-mono text-[11px] text-ink-muted">
          HTTP {error.status} · {error.code}
        </p>
      ) : null}
      {onRetry ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-1"
          onClick={onRetry}
          leftIcon={<RefreshCw size={14} />}
        >
          {retryLabel}
        </Button>
      ) : null}
    </div>
  )
}
