import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Activity,
  AlertOctagon,
  ArrowLeft,
  Globe,
  Inbox,
  Monitor,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'

import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  InfoRow,
  PageHeader,
  Pagination,
  StatCard,
} from '@/components/common'
import { AccessLogTable } from '@/components/security/AccessLogTable'
import { useAsync, useDebouncedValue, useDocumentTitle, usePagination } from '@/hooks'
import { adminPath } from '@/routes/navigation'
import { accessService } from '@/services/access.service'
import { AccessLogDetailModal } from '@/pages/monitoring/AccessLogDetailModal'
import { MonitorFilterBar } from '@/pages/monitoring/MonitorFilterBar'
import { buildAccessFilters, summarizeAccess } from '@/pages/monitoring/monitorFilters'
import type { MonitorFilterKey } from '@/pages/monitoring/monitorFilters'
import type { AccessLog } from '@/types'
import { formatDateTime } from '@/utils/format'

const STATS_SAMPLE_LIMIT = 200

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

/**
 * Access activity scoped to a single recipient identity. Device, browser and
 * network details are derived from the recipient's recorded events; the
 * username in the URL is a display filter only and never an authorization.
 */
export default function RecipientActivityPage() {
  const { recipientUsername = '' } = useParams()
  const username = decodeURIComponent(recipientUsername)
  useDocumentTitle(username ? `Activity · ${username}` : 'Recipient activity')

  const [filter, setFilter] = useState<MonitorFilterKey>('all')
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput, 350)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const { page, pageSize, setPage, setPageSize, reset } = usePagination(12)
  const [selected, setSelected] = useState<AccessLog | null>(null)

  useEffect(() => {
    reset()
  }, [debouncedSearch, filter, dateFrom, dateTo, reset])

  const filters = useMemo(
    () => buildAccessFilters({ filter, search: debouncedSearch, dateFrom, dateTo }),
    [filter, debouncedSearch, dateFrom, dateTo],
  )

  const tableState = useAsync(
    () => accessService.forRecipient(username, { ...filters, page, pageSize }),
    [username, filters, page, pageSize],
  )
  const statState = useAsync(
    () => accessService.forRecipient(username, { ...filters, pageSize: STATS_SAMPLE_LIMIT }),
    [username, filters],
  )

  const sampledLogs = useMemo(() => statState.data?.results ?? [], [statState.data])
  const displayName =
    sampledLogs.find((log) => log.recipientUsername)?.recipientUsername ?? username ?? 'Recipient'

  const stats = useMemo(
    () => summarizeAccess(sampledLogs, statState.data?.count),
    [sampledLogs, statState.data],
  )

  const summary = useMemo(() => {
    const devices = unique(sampledLogs.map((log) => log.device))
    const browsers = unique(sampledLogs.map((log) => log.browser))
    const systems = unique(sampledLogs.map((log) => log.os))
    const ips = unique(sampledLogs.map((log) => log.ip))
    const lastSeen = sampledLogs.reduce<string | null>(
      (latest, log) => (!latest || log.occurredAt > latest ? log.occurredAt : latest),
      null,
    )
    return { devices, browsers, systems, ips, lastSeen }
  }, [sampledLogs])

  const hasFilters =
    filter !== 'all' || debouncedSearch.length > 0 || dateFrom !== '' || dateTo !== ''

  const clearFilters = () => {
    setSearchInput('')
    setDateFrom('')
    setDateTo('')
    setFilter('all')
  }

  const reloadAll = () => {
    void tableState.reload()
    void statState.reload({ silent: true })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumbs={[
          { label: 'Access monitoring', to: adminPath('/monitoring') },
          { label: displayName },
        ]}
        title={displayName}
        description="All recorded access events for this recipient. The identifier in the URL is a display filter only — the API scopes and authorizes results server-side."
        actions={
          <>
            <Link to={adminPath('/monitoring')}>
              <Button variant="ghost" size="sm" leftIcon={<ArrowLeft size={15} />}>
                Back to monitoring
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw size={14} />}
              loading={tableState.loading || statState.loading}
              onClick={reloadAll}
            >
              Refresh
            </Button>
          </>
        }
      />

      <Card>
        <CardBody>
          <div className="flex items-center gap-3">
            <Avatar name={displayName} size="lg" />
            <div className="min-w-0 space-y-1">
              <p className="truncate font-mono text-[14px] font-semibold text-ink">
                {displayName}
              </p>
              <p className="truncate text-[12.5px] text-ink-muted">
                Image-specific recipient credentials
              </p>
            </div>
            <Badge tone="neutral" className="ml-auto shrink-0">
              Recipient
            </Badge>
          </div>
        </CardBody>
      </Card>

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

      <Card>
        <CardHeader
          title="Device & network summary"
          description="Distinct values observed across this recipient's recorded events."
        />
        <CardBody className="space-y-4">
          <dl className="grid gap-x-8 sm:grid-cols-2">
            <InfoRow label="Distinct devices" value={String(summary.devices.length)} />
            <InfoRow label="Distinct browsers" value={String(summary.browsers.length)} />
            <InfoRow label="Operating systems" value={String(summary.systems.length)} />
            <InfoRow label="Distinct IP addresses" value={String(summary.ips.length)} />
            <InfoRow
              label="Last seen"
              value={summary.lastSeen ? formatDateTime(summary.lastSeen) : '—'}
              className="sm:col-span-2"
            />
          </dl>

          {summary.devices.length > 0 ? (
            <div className="space-y-2 border-t border-line pt-4">
              <p className="flex items-center gap-1.5 text-[11.5px] font-medium tracking-wide text-ink-muted uppercase">
                <Monitor size={13} aria-hidden />
                Devices
              </p>
              <div className="flex flex-wrap gap-1.5">
                {summary.devices.map((device) => (
                  <Badge key={device} tone="neutral" size="sm">
                    {device}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          {summary.browsers.length > 0 ? (
            <div className="space-y-2 border-t border-line pt-4">
              <p className="text-[11.5px] font-medium tracking-wide text-ink-muted uppercase">
                Browsers
              </p>
              <div className="flex flex-wrap gap-1.5">
                {summary.browsers.map((browser) => (
                  <Badge key={browser} tone="neutral" size="sm">
                    {browser}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          {summary.ips.length > 0 ? (
            <div className="space-y-2 border-t border-line pt-4">
              <p className="flex items-center gap-1.5 text-[11.5px] font-medium tracking-wide text-ink-muted uppercase">
                <Globe size={13} aria-hidden />
                IP addresses
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {summary.ips.map((ip) => (
                  <span key={ip} className="font-mono text-[11.5px] text-ink-soft">
                    {ip}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <MonitorFilterBar
          filter={filter}
          onFilterChange={setFilter}
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
            title="Could not load recipient activity"
            onRetry={() => void tableState.reload()}
            className="py-12"
          />
        ) : (
          <AccessLogTable
            logs={tableState.data?.results ?? []}
            loading={tableState.loading}
            onRowClick={setSelected}
            emptyState={
              <EmptyState
                icon={<Inbox size={18} />}
                title={
                  hasFilters ? 'No events match these filters' : 'No activity for this recipient'
                }
                description={
                  hasFilters
                    ? 'Adjust the event filter, search term or date range to widen the results.'
                    : 'Access events for this recipient will appear here once they open a protected file.'
                }
                action={
                  hasFilters ? (
                    <Button variant="outline" size="sm" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
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

      <Alert tone="info" title="Server-scoped results">
        This view is limited to a single recipient identity. The username is read from the URL
        purely as a filter — access control is enforced by the backend.
      </Alert>

      <AccessLogDetailModal log={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
