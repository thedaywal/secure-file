import type { ReactNode } from 'react'

import { cn } from '@/utils/cn'

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
  compact?: boolean
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-6 py-8' : 'gap-3 px-6 py-14',
        className,
      )}
    >
      {icon ? (
        <span className="flex size-11 items-center justify-center rounded-full bg-surface-subtle text-ink-muted ring-1 ring-line">
          {icon}
        </span>
      ) : null}
      <div className="space-y-1">
        <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
        {description ? (
          <p className="mx-auto max-w-md text-[12.5px] leading-5 text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  )
}
