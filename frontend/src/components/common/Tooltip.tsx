import { useRef, useState, type ReactNode } from 'react'

import { cn } from '@/utils/cn'

export interface TooltipProps {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'bottom' | 'right'
  className?: string
}

/** Hover/focus tooltip. Purely additive — never the only source of information. */
export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  const [open, setOpen] = useState(false)
  const timer = useRef<number | null>(null)

  const show = () => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(true), 120)
  }
  const hide = () => {
    if (timer.current) window.clearTimeout(timer.current)
    setOpen(false)
  }

  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open ? (
        <span
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-40 max-w-xs animate-fade-in rounded-md bg-navy-900 px-2.5 py-1.5 text-[11.5px] leading-4 font-medium text-white shadow-pop',
            side === 'top' && 'bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2',
            side === 'bottom' && 'top-[calc(100%+6px)] left-1/2 -translate-x-1/2',
            side === 'right' && 'top-1/2 left-[calc(100%+6px)] -translate-y-1/2',
          )}
        >
          {content}
        </span>
      ) : null}
    </span>
  )
}
