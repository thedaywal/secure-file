import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button, IconButton } from '@/components/common/Button'
import { Select } from '@/components/common/Select'
import { cn } from '@/utils/cn'
import { formatNumber, pluralize } from '@/utils/format'

export interface PaginationProps {
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  pageSizeOptions?: number[]
  itemLabel?: string
  className?: string
}

function pageWindow(page: number, totalPages: number): (number | 'gap')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1)
  const pages = new Set<number>([1, totalPages, page, page - 1, page + 1])
  const sorted = [...pages].filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b)
  const output: (number | 'gap')[] = []
  sorted.forEach((value, index) => {
    if (index > 0 && value - sorted[index - 1] > 1) output.push('gap')
    output.push(value)
  })
  return output
}

export function Pagination({
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [8, 12, 20, 50],
  itemLabel = 'results',
  className,
}: PaginationProps) {
  if (totalItems === 0) return null

  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, totalItems)

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3',
        className,
      )}
    >
      <p className="text-[12.5px] text-ink-muted">
        Showing <span className="font-medium text-ink-soft">{first}</span>–
        <span className="font-medium text-ink-soft">{last}</span> of{' '}
        <span className="font-medium text-ink-soft">{formatNumber(totalItems)}</span> {itemLabel}
      </p>

      <div className="flex items-center gap-3">
        {onPageSizeChange ? (
          <div className="hidden items-center gap-2 sm:flex">
            <span className="text-[12.5px] text-ink-muted">Rows</span>
            <Select
              className="h-8 w-[68px] text-[12.5px]"
              value={String(pageSize)}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              options={pageSizeOptions.map((size) => ({ value: String(size), label: String(size) }))}
              aria-label="Rows per page"
            />
          </div>
        ) : null}

        <div className="flex items-center gap-1">
          <IconButton
            label="Previous page"
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft size={15} />
          </IconButton>

          <div className="hidden items-center gap-1 sm:flex">
            {pageWindow(page, totalPages).map((entry, index) =>
              entry === 'gap' ? (
                <span key={`gap-${index}`} className="px-1 text-ink-muted">
                  …
                </span>
              ) : (
                <Button
                  key={entry}
                  size="sm"
                  variant={entry === page ? 'primary' : 'ghost'}
                  aria-current={entry === page ? 'page' : undefined}
                  onClick={() => onPageChange(entry)}
                  className={cn('min-w-8 px-0 tabular-nums', entry !== page && 'text-ink-soft')}
                >
                  {entry}
                </Button>
              ),
            )}
          </div>

          <span className="px-1 text-[12.5px] text-ink-muted sm:hidden">
            {page} / {totalPages}
          </span>

          <IconButton
            label="Next page"
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight size={15} />
          </IconButton>
        </div>
      </div>
      <span className="sr-only">{pluralize(totalPages, 'page')}</span>
    </nav>
  )
}
