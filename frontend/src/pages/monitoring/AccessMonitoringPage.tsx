import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Activity,
  AlertOctagon,
  Ban,
  Inbox,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'

import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Pagination,
  Skeleton,
  StatCard,
} from '@/components/common'
import { RecipientAccessTable } from '@/components/security/RecipientAccessTable'
import { useToast } from '@/context/ToastContext'
import { useAsync, useDebouncedValue, useDocumentTitle, usePagination } from '@/hooks'
import { toApiError } from '@/services'
import { accessService } from '@/services/access.service'
import { AccessLogDetailModal } from '@/pages/monitoring/AccessLogDetailModal'
import { MonitorFilterBar } from '@/pages/monitoring/MonitorFilterBar'
import {
  buildAccessFilters,
  isMonitorFilterKey,
  summarizeAccess,
  summarizeByRecipient,
} from '@/pages/monitoring/monitorFilters'
import type { MonitorFilterKey } from '@/pages/monitoring/monitorFilters'
import { formatDateTime } from '@/utils/format'
import type { AccessLog, BlockedIP } from '@/types'

const STATS_SAMPLE_LIMIT = 200

/**
 * Security monitoring dashboard — the audit trail of every access attempt.
 * The seven required filters map onto access-log API parameters; the same
 * filter object drives the paginated table and the summary statistics.
 */
export default function AccessMonitoringPage() {
  useDocumentTitle('Access monitoring')
  const toast = useToast()
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

  /* Confirmation gates for the destructive actions. */
  const [pendingDelete, setPendingDelete] = useState<AccessLog | null>(null)
  const [pendingBlock, setPendingBlock] = useState<AccessLog | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  /* Manual address-blocking form. */
  const [newAddress, setNewAddress] = useState('')
  const [newReason, setNewReason] = useState('')
  const [addingBlock, setAddingBlock] = useState(false)

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

  /* One sample fetch feeds both the two-line summary table and the stat cards.
     The API caps page_size at 200, so the recipient view is computed from up to
     that many most recent matching events; recipients are paginated locally. */
  const sampleState = useAsync(
    () => accessService.list({ ...filters, pageSize: STATS_SAMPLE_LIMIT, fileId, recipientUsername }),
    [filters, fileId, recipientUsername],
  )

  const sample = sampleState.data?.results ?? []
  const summaries = useMemo(() => summarizeByRecipient(sample), [sample])
  const stats = useMemo(
    () => summarizeAccess(sample, sampleState.data?.count),
    [sample, sampleState.data?.count],
  )

  const totalRecipients = summaries.length
  const totalPages = Math.max(1, Math.ceil(totalRecipients / pageSize))
  const visibleSummaries = useMemo(
    () => summaries.slice((page - 1) * pageSize, page * pageSize),
    [summaries, page, pageSize],
  )

  /* Deleting events can shrink the last page out from under the cursor. */
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages, setPage])

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
    void sampleState.reload()
  }

  /* Blocklist — drives the per-row block affordance and the management panel. */
  const blockedState = useAsync(() => accessService.listBlocked(), [])
  const blockedAddresses = useMemo(
    () => (blockedState.data ?? []).map((item) => item.address),
    [blockedState.data],
  )

  const handleDeleteLog = async (log: AccessLog) => {
    try {
      await accessService.remove(log.id)
      toast.success('Access event deleted')
      if (visibleSummaries.length === 1 && page > 1) setPage(page - 1)
      else await reloadAll()
    } catch (failure) {
      toast.error('Could not delete access event', toApiError(failure).message)
    }
  }

  const handleClearLogs = async () => {
    try {
      const { deleted } = await accessService.clear({ ...filters, fileId, recipientUsername })
      toast.success(
        deleted > 0 ? `${deleted} ${deleted === 1 ? 'event' : 'events'} deleted` : 'Nothing to delete',
      )
      setPage(1)
      await reloadAll()
    } catch (failure) {
      toast.error('Could not clear access events', toApiError(failure).message)
    }
  }

  const handleBlockAddress = async (address: string, reason = '') => {
    try {
      await accessService.blockIP({ address, reason })
      toast.success('Address blocked', `${address} can no longer open your protected links.`)
      await blockedState.reload()
      return true
    } catch (failure) {
      toast.error('Could not block address', toApiError(failure).message)
      return false
    }
  }

  const handleAddBlock = async () => {
    const address = newAddress.trim()
    if (!address) return
    setAddingBlock(true)
    const ok = await handleBlockAddress(address, newReason.trim())
    if (ok) {
      setNewAddress('')
      setNewReason('')
    }
    setAddingBlock(false)
  }

  const handleUnblock = async (record: BlockedIP) => {
    try {
      await accessService.unblockIP(record.id)
      toast.success('Block lifted', `${record.address} can open links again.`)
      await blockedState.reload()
    } catch (failure) {
      toast.error('Could not lift block', toApiError(failure).message)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Access monitoring"
        description="Every successful and blocked access attempt against your protected files. Filter by outcome, abuse signal and time range, then open a row for the full audit record."
        actions={
          <>
            <Button
              variant="outline"
              leftIcon={<Trash2 size={16} />}
              className="text-danger-600 hover:border-danger-200 hover:bg-danger-50"
              disabled={(sampleState.data?.count ?? 0) === 0}
              onClick={() => setConfirmClear(true)}
            >
              Delete filtered
            </Button>
            <Button
              variant="outline"
              leftIcon={<RefreshCw size={16} />}
              loading={sampleState.loading}
              onClick={reloadAll}
            >
              Refresh
            </Button>
          </>
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
          loading={sampleState.loading}
        />
        <StatCard
          label="Successful"
          value={stats.successful}
          icon={<ShieldCheck size={16} />}
          tone="success"
          hint="authenticated deliveries"
          loading={sampleState.loading}
        />
        <StatCard
          label="Failed / blocked"
          value={stats.failed}
          icon={<ShieldAlert size={16} />}
          tone="danger"
          hint="denied or blocked attempts"
          loading={sampleState.loading}
        />
        <StatCard
          label="High-risk"
          value={stats.highRisk}
          icon={<AlertOctagon size={16} />}
          tone="danger"
          hint="high + critical"
          loading={sampleState.loading}
        />
      </div>

      <p className="text-[11.5px] text-ink-muted">
        Each recipient is collapsed to at most two lines — the successful open and any blocked
        reuse. Tallies are computed from up to the {STATS_SAMPLE_LIMIT} most recent matching events.
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

        {sampleState.error ? (
          <ErrorState
            error={sampleState.error}
            title="Could not load access activity"
            onRetry={() => void sampleState.reload()}
            className="py-12"
          />
        ) : (
          <RecipientAccessTable
            summaries={visibleSummaries}
            loading={sampleState.loading}
            onRowClick={setSelected}
            onDelete={(log) => setPendingDelete(log)}
            onBlockIP={(log) => setPendingBlock(log)}
            blockedAddresses={blockedAddresses}
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

        {!sampleState.loading && !sampleState.error && totalRecipients > 0 ? (
          <Pagination
            page={page}
            pageSize={pageSize}
            totalItems={totalRecipients}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemLabel="recipients"
          />
        ) : null}
      </Card>

      <Card>
        <CardHeader
          icon={<Ban size={16} />}
          title="Blocked IP addresses"
          description="Public client addresses that can no longer open your protected links. Addresses are added manually, or automatically when one accumulates repeated failures or tries to reuse a consumed link. Blocking is a deterrent layered on top of the single-use link — never the only control."
        />

        <form
          className="flex flex-col gap-2 border-b border-line p-4 sm:flex-row sm:items-center"
          onSubmit={(event) => {
            event.preventDefault()
            void handleAddBlock()
          }}
        >
          <Input
            aria-label="Public IP address to block"
            className="w-full sm:max-w-[220px]"
            placeholder="203.0.113.42"
            value={newAddress}
            onChange={(event) => setNewAddress(event.target.value)}
          />
          <Input
            aria-label="Reason for blocking this address"
            className="w-full sm:max-w-xs"
            placeholder="Reason (optional)"
            value={newReason}
            onChange={(event) => setNewReason(event.target.value)}
          />
          <Button
            type="submit"
            leftIcon={<Ban size={16} />}
            loading={addingBlock}
            disabled={!newAddress.trim()}
          >
            Block address
          </Button>
        </form>

        {blockedState.loading ? (
          <div className="divide-y divide-line">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="size-8" />
              </div>
            ))}
          </div>
        ) : blockedState.error ? (
          <ErrorState
            error={blockedState.error}
            title="Could not load blocked addresses"
            onRetry={() => void blockedState.reload()}
            className="py-10"
          />
        ) : (blockedState.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<Ban size={18} />}
            title="No addresses blocked"
            description="Block an address from a row in the table above, or enter the public IP of a client you want to keep out."
          />
        ) : (
          <ul className="divide-y divide-line">
            {(blockedState.data ?? []).map((record) => (
              <li
                key={record.id}
                className="flex items-center justify-between gap-4 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-[13px] font-medium text-ink">{record.address}</p>
                    <Badge tone={record.source === 'auto' ? 'danger' : 'neutral'} size="sm">
                      {record.source === 'auto' ? 'Auto-blocked' : 'Manual'}
                    </Badge>
                  </div>
                  <p className="truncate text-[12px] text-ink-muted">
                    {record.reason ? `${record.reason} · ` : ''}
                    Blocked {formatDateTime(record.blockedAt)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<X size={14} />}
                  onClick={() => void handleUnblock(record)}
                >
                  Unblock
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (pendingDelete) await handleDeleteLog(pendingDelete)
        }}
        title="Delete access event?"
        description={`Permanently remove this recorded event for “${pendingDelete?.fileName || 'this file'}” (${pendingDelete?.eventType.replace(/-/g, ' ') ?? 'event'})? The audit-trail row is deleted for good.`}
        confirmLabel="Delete event"
        tone="danger"
      />

      <ConfirmDialog
        open={Boolean(pendingBlock)}
        onClose={() => setPendingBlock(null)}
        onConfirm={async () => {
          if (pendingBlock) await handleBlockAddress(pendingBlock.ip)
        }}
        title="Block this address?"
        description={`Block ${pendingBlock?.ip ?? 'this address'}? Anyone behind it will be denied access to every protected link and each attempt is recorded. Blocking is a deterrent on top of the single-use link — it never replaces it.`}
        confirmLabel="Block address"
        tone="danger"
      />

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={handleClearLogs}
        title="Delete filtered events?"
        description={`Permanently delete ${sampleState.data?.count ?? 0} access ${
          (sampleState.data?.count ?? 0) === 1 ? 'event' : 'events'
        } matching the current filters? This cannot be undone.`}
        confirmLabel="Delete events"
        tone="danger"
      />

      <AccessLogDetailModal log={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
