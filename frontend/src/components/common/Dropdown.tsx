import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { cn } from '@/utils/cn'

export interface DropdownItem {
  id: string
  label: string
  icon?: ReactNode
  onSelect: () => void
  tone?: 'default' | 'danger'
  disabled?: boolean
  /** Renders a divider above this item. */
  separated?: boolean
}

export interface DropdownProps {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode
  items: DropdownItem[]
  align?: 'left' | 'right'
  className?: string
  menuClassName?: string
}

/** Fallback width of the menu (`min-w-52` = 13rem) before it has been measured. */
const FALLBACK_MENU_WIDTH = 208

export function Dropdown({ trigger, items, align = 'right', className, menuClassName }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    setCoords(null)
  }, [])

  /* Anchor the menu to the trigger. It lives in a portal so it is never clipped
   * by scrollable ancestors (e.g. the table's overflow-x-auto wrapper). */
  const reposition = useCallback(() => {
    const anchor = containerRef.current
    if (!anchor) return

    const rect = anchor.getBoundingClientRect()
    const width = menuRef.current?.offsetWidth ?? FALLBACK_MENU_WIDTH
    const height = menuRef.current?.offsetHeight ?? 0

    let left = align === 'right' ? rect.right - width : rect.left
    left = Math.min(Math.max(8, left), window.innerWidth - width - 8)

    let top = rect.bottom + 6
    if (height && top + height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - height - 6)
    }

    setCoords({ top, left })
  }, [align])

  useLayoutEffect(() => {
    if (open) reposition()
  }, [open, reposition])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (containerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      close()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    const handleReflow = () => reposition()

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleReflow, true)
    window.addEventListener('resize', handleReflow)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleReflow, true)
      window.removeEventListener('resize', handleReflow)
    }
  }, [open, reposition, close])

  return (
    <div ref={containerRef} className={cn('relative inline-flex', className)}>
      {trigger({ open, toggle: () => (open ? close() : setOpen(true)) })}
      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{
                top: coords?.top ?? 0,
                left: coords?.left ?? 0,
                visibility: coords ? 'visible' : 'hidden',
              }}
              className={cn(
                'fixed z-40 min-w-52 animate-scale-in overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-pop',
                menuClassName,
              )}
            >
              {items.map((item) => (
                <div key={item.id}>
                  {item.separated ? <div className="my-1 h-px bg-line" /> : null}
                  <button
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => {
                      close()
                      item.onSelect()
                    }}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                      item.tone === 'danger'
                        ? 'text-danger-600 hover:bg-danger-50'
                        : 'text-ink-soft hover:bg-surface-subtle hover:text-ink',
                    )}
                  >
                    {item.icon ? <span className="shrink-0 text-current">{item.icon}</span> : null}
                    {item.label}
                  </button>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
