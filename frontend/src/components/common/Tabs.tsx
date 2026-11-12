import type { ReactNode } from 'react'

import { cn } from '@/utils/cn'

export interface TabItem<T extends string> {
  value: T
  label: string
  icon?: ReactNode
  count?: number
  disabled?: boolean
}

export interface TabsProps<T extends string> {
  items: TabItem<T>[]
  value: T
  onChange: (value: T) => void
  variant?: 'underline' | 'pill'
  className?: string
  'aria-label'?: string
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  variant = 'underline',
  className,
  ...rest
}: TabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={rest['aria-label']}
      className={cn(
        'scrollbar-slim flex items-center gap-1 overflow-x-auto',
        variant === 'underline' ? 'border-b border-line' : 'rounded-lg bg-surface-subtle p-1',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 px-3 text-[13px] font-medium whitespace-nowrap transition-colors',
              'focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none disabled:opacity-50',
              variant === 'underline'
                ? cn(
                    '-mb-px h-9 rounded-t-md border-b-2',
                    active
                      ? 'border-brand-600 text-brand-700'
                      : 'border-transparent text-ink-muted hover:text-ink',
                  )
                : cn('h-8 rounded-md', active ? 'bg-surface text-ink shadow-card' : 'text-ink-soft hover:text-ink'),
            )}
          >
            {item.icon}
            {item.label}
            {typeof item.count === 'number' ? (
              <span
                className={cn(
                  'rounded px-1.5 py-px text-[11px] tabular-nums',
                  active ? 'bg-brand-50 text-brand-700' : 'bg-navy-900/5 text-ink-muted',
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
