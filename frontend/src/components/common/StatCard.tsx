import type { ReactNode } from 'react'
import { Minus, TrendingDown, TrendingUp } from 'lucide-react'

import { Skeleton } from '@/components/common/Skeleton'
import { cn } from '@/utils/cn'
import { formatCompact } from '@/utils/format'
import type { ToneIntent } from '@/utils/labels'

const ICON_TONES: Record<ToneIntent, string> = {
  neutral: 'bg-navy-900/6 text-ink-soft',
  brand: 'bg-brand-50 text-brand-600',
  success: 'bg-success-50 text-success-600',
  warning: 'bg-warning-50 text-warning-600',
  danger: 'bg-danger-50 text-danger-600',
  info: 'bg-info-50 text-info-600',
}

export interface StatCardProps {
  label: string
  value: number | string
  icon?: ReactNode
  tone?: ToneIntent
  delta?: { value: number; direction: 'up' | 'down' | 'flat' }
  hint?: ReactNode
  loading?: boolean
  className?: string
  onHoverHint?: string
}

export function StatCard({
  label,
  value,
  icon,
  tone = 'brand',
  delta,
  hint,
  loading,
  className,
}: StatCardProps) {
  const displayValue = typeof value === 'number' ? formatCompact(value) : value

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border border-line bg-surface p-4 shadow-card transition-shadow hover:shadow-raised',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-medium text-ink-muted">{label}</p>
          {loading ? (
            <Skeleton className="mt-2.5 h-7 w-20" />
          ) : (
            <p className="mt-1.5 text-[26px] leading-8 font-semibold tracking-tight text-ink tabular-nums">
              {displayValue}
            </p>
          )}
        </div>
        {icon ? (
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-lg',
              ICON_TONES[tone],
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        {loading ? (
          <Skeleton className="h-3 w-28" />
        ) : (
          <>
            {delta && delta.direction !== 'flat' ? (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11.5px] font-semibold',
                  delta.direction === 'up'
                    ? 'bg-success-50 text-success-700'
                    : 'bg-danger-50 text-danger-700',
                )}
              >
                {delta.direction === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {delta.value}%
              </span>
            ) : delta ? (
              <span className="inline-flex items-center gap-0.5 rounded bg-navy-900/6 px-1.5 py-0.5 text-[11.5px] font-semibold text-ink-muted">
                <Minus size={12} />
                flat
              </span>
            ) : null}
            {hint ? <span className="truncate text-[11.5px] text-ink-muted">{hint}</span> : null}
          </>
        )}
      </div>
    </div>
  )
}
