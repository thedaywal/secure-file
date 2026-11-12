import type { ElementType, HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/utils/cn'

export interface CardProps extends HTMLAttributes<HTMLElement> {
  padded?: boolean
  as?: 'div' | 'section' | 'article' | 'li'
}

export function Card({ padded = false, className, as = 'div', children, ...props }: CardProps) {
  const Component = as as ElementType
  return (
    <Component
      className={cn(
        'rounded-xl border border-line bg-surface shadow-card',
        padded && 'p-5',
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  )
}

export interface CardHeaderProps {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  icon?: ReactNode
  className?: string
  /** Removes bottom padding for headers that sit directly on a table. */
  flush?: boolean
}

export function CardHeader({
  title,
  description,
  actions,
  icon,
  className,
  flush = false,
}: CardHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-line px-5',
        flush ? 'py-3.5' : 'pt-4 pb-4',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h3 className="truncate text-[15px] leading-6 font-semibold text-ink">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-[12.5px] leading-5 text-ink-muted">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function CardBody({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-5', className)} {...props}>
      {children}
    </div>
  )
}

export function CardFooter({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-subtle/60 px-5 py-3.5',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/** Compact key/value row used across detail drawers and summary panels. */
export interface InfoRowProps {
  label: ReactNode
  value: ReactNode
  className?: string
  mono?: boolean
}

export function InfoRow({ label, value, className, mono }: InfoRowProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-2', className)}>
      <dt className="shrink-0 text-[12.5px] text-ink-muted">{label}</dt>
      <dd
        className={cn(
          'min-w-0 text-right text-[13px] font-medium break-words text-ink',
          mono && 'font-mono text-[12px]',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

export function InfoList({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn('divide-y divide-line/70', className)}>{children}</dl>
}
