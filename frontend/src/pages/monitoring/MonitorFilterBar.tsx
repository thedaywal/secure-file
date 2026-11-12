import { ListFilter, X } from 'lucide-react'

import { Button, Input, SearchInput, SegmentedControl } from '@/components/common'
import {
  MONITOR_FILTER_LABEL,
  MONITOR_FILTER_OPTIONS,
} from '@/pages/monitoring/monitorFilters'
import type { MonitorFilterKey } from '@/pages/monitoring/monitorFilters'

export interface MonitorFilterBarProps {
  filter: MonitorFilterKey
  onFilterChange: (filter: MonitorFilterKey) => void
  search: string
  onSearchChange: (value: string) => void
  dateFrom: string
  dateTo: string
  onDateFromChange: (value: string) => void
  onDateToChange: (value: string) => void
  onClear: () => void
}

/**
 * Shared access-monitoring filter bar. The event filter is one of the seven
 * required security signals; search and the date range narrow the audit log
 * further. Every control maps directly onto an access-log API parameter.
 */
export function MonitorFilterBar({
  filter,
  onFilterChange,
  search,
  onSearchChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onClear,
}: MonitorFilterBarProps) {
  const hasFilters =
    filter !== 'all' || search.trim().length > 0 || dateFrom !== '' || dateTo !== ''

  return (
    <div className="space-y-3 border-b border-line p-4">
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-[11.5px] font-medium tracking-wide text-ink-muted uppercase">
          <ListFilter size={13} aria-hidden />
          Event filter
        </p>
        <SegmentedControl
          value={filter}
          onChange={onFilterChange}
          options={MONITOR_FILTER_OPTIONS}
          size="sm"
          aria-label="Event filter"
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-xs">
          <SearchInput
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            onClear={() => onSearchChange('')}
            placeholder="Search recipient, file, IP or device…"
            aria-label="Search access activity"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Input
              type="date"
              aria-label="Activity from date"
              className="w-auto"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => onDateFromChange(event.target.value)}
            />
            <span className="text-[12.5px] text-ink-muted">to</span>
            <Input
              type="date"
              aria-label="Activity to date"
              className="w-auto"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => onDateToChange(event.target.value)}
            />
          </div>
          {hasFilters ? (
            <Button variant="ghost" size="sm" leftIcon={<X size={14} />} onClick={onClear}>
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      <p className="text-[11.5px] text-ink-muted">
        Filtering by{' '}
        <span className="font-medium text-ink-soft">{MONITOR_FILTER_LABEL[filter]}</span>.
      </p>
    </div>
  )
}
