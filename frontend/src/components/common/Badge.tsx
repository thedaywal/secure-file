import type { ReactNode } from 'react'

import { cn } from '@/utils/cn'
import type { ToneIntent } from '@/utils/labels'

const TONES: Record<ToneIntent, string> = {
  neutral: 'bg-navy-900/6 text-ink-soft ring-navy-900/10',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  success: 'bg-success-50 text-success-700 ring-success-200',
  warning: 'bg-warning-50 text-warning-700 ring-warning-200',
  danger: 'bg-danger-50 text-danger-700 ring-danger-200',
  info: 'bg-info-50 text-info-700 ring-info-100',
}

export interface BadgeProps {
  children: ReactNode
  tone?: ToneIntent
  icon?: ReactNode
  size?: 'sm' | 'md'
  className?: string
  /** Adds a small leading dot — useful for live status. */
  dot?: boolean
}

export function Badge({ children, tone = 'neutral', icon, size = 'md', className, dot }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-[12px]',
        TONES[tone],
        className,
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : icon}
      {children}
    </span>
  )
}

export interface StatusDotProps {
  tone?: ToneIntent
  pulse?: boolean
  className?: string
  label?: string
}

const DOT_TONES: Record<ToneIntent, string> = {
  neutral: 'bg-slate-400',
  brand: 'bg-brand-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
  info: 'bg-info-500',
}

export function StatusDot({ tone = 'neutral', pulse, className, label }: StatusDotProps) {
  return (
    <span className={cn('relative inline-flex size-2 shrink-0', className)} title={label}>
      {pulse ? (
        <span
          className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-60', DOT_TONES[tone])}
        />
      ) : null}
      <span className={cn('relative inline-flex size-2 rounded-full', DOT_TONES[tone])} />
    </span>
  )
}
