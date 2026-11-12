import type { ReactNode } from 'react'

import { cn } from '@/utils/cn'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  count?: number
}

export interface SegmentedControlProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: SegmentedOption<T>[]
  size?: 'sm' | 'md'
  className?: string
  'aria-label'?: string
}

/** Compact, single-select pill group used for status filters and view switches. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
  ...rest
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={rest['aria-label']}
      className={cn(
        'inline-flex flex-wrap items-center gap-1 rounded-lg border border-line bg-surface-subtle p-1',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md font-medium transition-colors',
              size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3 text-[13px]',
              active
                ? 'bg-surface text-ink shadow-card'
                : 'text-ink-soft hover:bg-surface/70 hover:text-ink',
            )}
          >
            {option.label}
            {typeof option.count === 'number' ? (
              <span
                className={cn(
                  'rounded px-1.5 py-px text-[11px] tabular-nums',
                  active ? 'bg-brand-50 text-brand-700' : 'bg-navy-900/5 text-ink-muted',
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
