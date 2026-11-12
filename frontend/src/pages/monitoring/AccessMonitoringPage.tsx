import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Activity,
  AlertOctagon,
  Inbox,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react'

import {
  Alert,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  StatCard,
} from '@/components/common'
import { AccessLogTable } from '@/components/security/AccessLogTable'
import { useAsync, useDebouncedValue, useDocumentTitle, usePagination } from '@/hooks'
import { accessService } from '@/services/access.service'
import { AccessLogDetailModal } from '@/pages/monitoring/AccessLogDetailModal'
import { MonitorFilterBar } from '@/pages/monitoring/MonitorFilterBar'
import {
  buildAccessFilters,
  isMonitorFilterKey,
  summarizeAccess,
} from '@/pages/monitoring/monitorFilters'
import type { MonitorFilterKey } from '@/pages/monitoring/monitorFilters'
import type { AccessLog } from '@/types'

const STATS_SAMPLE_LIMIT = 200

/**
 * Security monitoring dashboard — the audit trail of every access attempt.
 * The seven required filters map onto access-log API parameters; the same
 * filter object drives the paginated table and the summary statistics.
 */
export default function AccessMonitoringPage() {
  useDocumentTitle('Access monitoring')
  const [searchParams, setSearchParams] = useSearchParams()

  /* URL identifiers are display filters only; the API scopes results. */
  const fileId = searchParams.get('fileId') ?? undefined
  const recipientUsername = searchParams.get('recipientUsername') ?? undefined
  const scoped = Boolean(fileId || recipientUsername)

  const [filter, setFilter] = useState<MonitorFilterKey>(() => {
    const value = searchParams.get('filter')
    return isMonitorFilterKey(value) ? value : 'all'
  })
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput, 350)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const { page, pageSize, setPage, setPageSize, reset } = usePagination(12)
  const [selected, setSelected] = useState<AccessLog | null>(null)

  /* Mirror the active filter into the URL for deep-linking / shareable views. */
  const applyFilter = (next: MonitorFilterKey) => {
    setFilter(next)
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (next === 'all') params.delete('filter')
        else params.set('filter', next)
        return params
      },
      { replace: true },
    )
  }

  /* Any filter change returns to the first page. */
  useEffect(() => {
    reset()
  }, [debouncedSearch, filter, dateFrom, dateTo, fileId, recipientUsername, reset])

  const filters = useMemo(
    () => buildAccessFilters({ filter, search: debouncedSearch, dateFrom, dateTo }),
    [filter, debouncedSearch, dateFrom, dateTo],
  )

  const tableState = useAsync(
    () => accessService.list({ ...filters, page, pageSize, fileId, recipientUsername }),
    [filters, page, pageSize, fileId, recipientUsername],
  )
  const statState = useAsync(
    () => accessService.list({ ...filters, pageSize: STATS_SAMPLE_LIMIT, fileId, recipientUsername }),
    [filters, fileId, recipientUsername],
  )

  const logs = tableState.data?.results ?? []
  const stats = useMemo(
    () => summarizeAccess(statState.data?.results ?? [], statState.data?.count),
    [statState.data],
  )

  const hasFilters =
    filter !== 'all' ||
    debouncedSearch.length > 0 ||
    dateFrom !== '' ||
    dateTo !== '' ||
    scoped

  const clearFilters = () => {
    setSearchInput('')
    setDateFrom('')
    setDateTo('')
    applyFilter('all')
  }

  const clearScope = () => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        params.delete('fileId')
        params.delete('recipientUsername')
        return params
      },
      { replace: true },
    )
  }

  const reloadAll = () => {
    void tableState.reload()
    void statState.reload({ silent: true })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Access monitoring"
        description="Every successful and blocked access attempt against your protected files. Filter by outcome, abuse signal and time range, then open a row for the full audit record."
        actions={
          <Button
            variant="outline"
            leftIcon={<RefreshCw size={16} />}
            loading={tableState.loading || statState.loading}
            onClick={reloadAll}
          >
            Refresh
          </Button>
        }
      />

      {scoped ? (
        <Alert
          tone="info"
          title="Scoped view"
          actions={
            <Button variant="outline" size="sm" leftIcon={<X size={14} />} onClick={clearScope}>
              Clear scope
            </Button>
          }
        >
          Results are narrowed by a {fileId ? 'file' : 'recipient'} identifier in the URL. That
          identifier is a display filter only — the API authorizes and scopes every result
          server-side.
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total events"
          value={stats.total}
          icon={<Activity size={16} />}
          tone="brand"
          hint="matching current filters"
          loading={statState.loading}
        />
        <StatCard
          label="Successful"
          value={stats.successful}
          icon={<ShieldCheck size={16} />}
          tone="success"
          hint="authenticated deliveries"
          loading={statState.loading}
        />
        <StatCard
          label="Failed / blocked"
          value={stats.failed}
          icon={<ShieldAlert size={16} />}
          tone="danger"
          hint="denied or blocked attempts"
          loading={statState.loading}
        />
        <StatCard
          label="High-risk"
          value={stats.highRisk}
          icon={<AlertOctagon size={16} />}
          tone="danger"
          hint="high + critical"
          loading={statState.loading}
        />
      </div>

      <p className="text-[11.5px] text-ink-muted">
        The total reflects the server count for the current filters; outcome and risk tallies are
        computed from up to the {STATS_SAMPLE_LIMIT} most recent matching events.
      </p>

      <Card>
        <MonitorFilterBar
          filter={filter}
          onFilterChange={applyFilter}
          search={searchInput}
          onSearchChange={setSearchInput}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          onClear={clearFilters}
        />

        {tableState.error ? (
          <ErrorState
            error={tableState.error}
            title="Could not load access activity"
            onRetry={() => void tableState.reload()}
            className="py-12"
          />
        ) : (
          <AccessLogTable
            logs={logs}
            loading={tableState.loading}
            onRowClick={setSelected}
            emptyState={
              hasFilters ? (
                <EmptyState
                  icon={<Inbox size={18} />}
                  title="No events match these filters"
                  description="Adjust the event filter, search term or date range to widen the results."
                  action={
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={<Inbox size={18} />}
                  title="No access activity yet"
                  description="Successful and blocked access attempts will appear here as recipients interact with your protected files."
                />
              )
            }
          />
        )}

        {!tableState.loading && !tableState.error && (tableState.data?.count ?? 0) > 0 ? (
          <Pagination
            page={page}
            pageSize={pageSize}
            totalItems={tableState.data?.count ?? 0}
            totalPages={tableState.data?.totalPages ?? 1}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemLabel="events"
          />
        ) : null}
      </Card>

      <AccessLogDetailModal log={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
