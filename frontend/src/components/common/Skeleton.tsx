import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/utils/cn'

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-md bg-navy-900/8', className)}
      {...props}
    />
  )
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn('h-3', index === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  )
}

/** Placeholder rows for the shared list/table layout. */
export function TableSkeleton({
  rows = 6,
  columns = 5,
  className,
}: {
  rows?: number
  columns?: number
  className?: string
}) {
  return (
    <div className={cn('divide-y divide-line', className)} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-4 px-5 py-3.5">
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <Skeleton
              key={columnIndex}
              className={cn('h-3.5', columnIndex === 0 ? 'w-1/4' : 'flex-1')}
            />
          ))}
        </div>
      ))}
      <span className="sr-only">Loading data</span>
    </div>
  )
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-16" />
      <Skeleton className="mt-3 h-3 w-20" />
    </div>
  )
}

export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex h-64 items-end gap-2 px-1 pb-1', className)} aria-busy="true">
      {Array.from({ length: 14 }).map((_, index) => (
        <Skeleton
          key={index}
          className="flex-1"
          style={{ height: `${35 + ((index * 13) % 55)}%` }}
        />
      ))}
    </div>
  )
}

export function CardSkeleton({ children }: { children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-card">{children}</div>
  )
}
