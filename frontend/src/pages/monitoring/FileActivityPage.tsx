import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Activity,
  AlertOctagon,
  ArrowLeft,
  FileWarning,
  Inbox,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'

import {
  Alert,
  Button,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  InfoRow,
  PageHeader,
  Pagination,
  Skeleton,
  StatCard,
  StatCardSkeleton,
} from '@/components/common'
import { FileTypeIcon, fileKindLabel } from '@/components/files'
import { AccessLogTable } from '@/components/security/AccessLogTable'
import { ProtectionStatusBadge } from '@/components/security/SecurityBadges'
import { useAsync, useDebouncedValue, useDocumentTitle, usePagination } from '@/hooks'
import { adminPath } from '@/routes/navigation'
import { accessService } from '@/services/access.service'
import { filesService } from '@/services/files.service'
import { AccessLogDetailModal } from '@/pages/monitoring/AccessLogDetailModal'
import { MonitorFilterBar } from '@/pages/monitoring/MonitorFilterBar'
import { buildAccessFilters, summarizeAccess } from '@/pages/monitoring/monitorFilters'
import type { MonitorFilterKey } from '@/pages/monitoring/monitorFilters'
import type { AccessLog, ApiError } from '@/types'

const STATS_SAMPLE_LIMIT = 200

function isNotFound(error: ApiError | null): boolean {
  if (!error) return false
  return error.status === 404 || error.code === 'not_found'
}

/**
 * Access activity scoped to a single protected file. The `fileId` in the URL
 * is a display filter only — the API scopes and authorizes every result.
 */
export default function FileActivityPage() {
  const { fileId = '' } = useParams()
  const fileState = useAsync(() => filesService.get(fileId), [fileId])
  const file = fileState.data
  useDocumentTitle(file ? `Activity · ${file.name}` : 'File activity')

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
    () => accessService.forFile(fileId, { ...filters, page, pageSize }),
    [fileId, filters, page, pageSize],
  )
  const statState = useAsync(
    () => accessService.forFile(fileId, { ...filters, pageSize: STATS_SAMPLE_LIMIT }),
    [fileId, filters],
  )

  const stats = useMemo(
    () => summarizeAccess(statState.data?.results ?? [], statState.data?.count),
    [statState.data],
  )

  const hasFilters =
    filter !== 'all' || debouncedSearch.length > 0 || dateFrom !== '' || dateTo !== ''

  const clearFilters = () => {
    setSearchInput('')
    setDateFrom('')
    setDateTo('')
    setFilter('all')
  }

  const reloadAll = () => {
    void fileState.reload()
    void tableState.reload()
    void statState.reload({ silent: true })
  }

  if (fileState.loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    )
  }

  if (fileState.error) {
    return (
      <div className="space-y-5">
        <PageHeader
          breadcrumbs={[{ label: 'Access monitoring', to: adminPath('/monitoring') }]}
          title="File activity"
        />
        {isNotFound(fileState.error) ? (
          <Card>
            <EmptyState
              icon={<FileWarning size={20} />}
              title="File not found"
              description="This file may have been deleted, or you no longer have access to it."
              action={
                <Link to={adminPath('/monitoring')}>
                  <Button variant="outline">Back to monitoring</Button>
                </Link>
              }
            />
          </Card>
        ) : (
          <ErrorState
            error={fileState.error}
            title="Could not load this file"
            onRetry={() => void fileState.reload()}
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumbs={[
          { label: 'Access monitoring', to: adminPath('/monitoring') },
          { label: file?.name ?? 'File activity' },
        ]}
        title={file?.name ?? 'File activity'}
        badge={file ? <ProtectionStatusBadge status={file.protectionStatus} /> : undefined}
        description="Access activity filtered to this file. The identifier in the URL is a display filter only — the API scopes results server-side."
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

      {file ? (
        <Card>
          <CardBody>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <FileTypeIcon extension={file.extension} size="lg" />
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-[15px] font-semibold text-ink">{file.name}</p>
                  <p className="truncate text-[12.5px] text-ink-muted">
                    {file.extension} · {fileKindLabel(file.kind)}
                    {file.ownerName ? ` · Owner ${file.ownerName}` : ''}
                  </p>
                </div>
              </div>
              <dl className="w-full sm:max-w-[260px]">
                <InfoRow label="Encryption" value={file.encryption} />
                <InfoRow label="Active share links" value={String(file.activeShareLinks)} />
                <InfoRow label="Authorized recipients" value={String(file.authorizedRecipients)} />
              </dl>
            </div>
          </CardBody>
        </Card>
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
          label="Successful access"
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
          label="High-risk events"
          value={stats.highRisk}
          icon={<AlertOctagon size={16} />}
          tone="danger"
          hint="high + critical"
          loading={statState.loading}
        />
      </div>

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
            title="Could not load file activity"
            onRetry={() => void tableState.reload()}
            className="py-12"
          />
        ) : (
          <AccessLogTable
            logs={tableState.data?.results ?? []}
            loading={tableState.loading}
            hideFile
            onRowClick={setSelected}
            emptyState={
              <EmptyState
                icon={<Inbox size={18} />}
                title={hasFilters ? 'No events match these filters' : 'No activity for this file yet'}
                description={
                  hasFilters
                    ? 'Adjust the event filter, search term or date range to widen the results.'
                    : 'Access attempts against this file will appear here once recipients open it.'
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
        This view is limited to a single file. The file identifier is read from the URL purely as a
        filter — access control is enforced by the backend.
      </Alert>

      <AccessLogDetailModal log={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
