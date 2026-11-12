import type { HTMLAttributes, ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react'

import { cn } from '@/utils/cn'

export interface TableProps extends HTMLAttributes<HTMLDivElement> {
  /** Wraps the table in a horizontally scrollable container. */
  children: ReactNode
}

export function Table({ className, children, ...props }: TableProps) {
  return (
    <div className={cn('scrollbar-slim w-full overflow-x-auto', className)} {...props}>
      <table className="w-full min-w-[720px] border-collapse text-left">{children}</table>
    </div>
  )
}

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-line bg-surface-subtle/70">
      <tr>{children}</tr>
    </thead>
  )
}

export interface TableHeaderCellProps extends ThHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'right' | 'center'
}

export function TableHeaderCell({ align = 'left', className, children, ...props }: TableHeaderCellProps) {
  return (
    <th
      scope="col"
      className={cn(
        'px-4 py-2.5 text-[11.5px] font-semibold tracking-wide text-ink-muted uppercase',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
      {...props}
    >
      {children}
    </th>
  )
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-line">{children}</tbody>
}

export function TableRow({
  className,
  children,
  interactive,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }) {
  return (
    <tr
      className={cn(
        'transition-colors',
        interactive && 'cursor-pointer hover:bg-brand-50/40',
        className,
      )}
      {...props}
    >
      {children}
    </tr>
  )
}

export interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'right' | 'center'
}

export function TableCell({ align = 'left', className, children, ...props }: TableCellProps) {
  return (
    <td
      className={cn(
        'px-4 py-3 align-middle text-[13px] text-ink-soft',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
      {...props}
    >
      {children}
    </td>
  )
}

export function TableEmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        {children}
      </td>
    </tr>
  )
}
