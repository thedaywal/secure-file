import { useEffect, useState } from 'react'
import {
  Check,
  Copy,
  History,
  Laptop,
  Monitor,
  MonitorSmartphone,
  MoreHorizontal,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Tablet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import {
  Alert,
  Avatar,
  Button,
  Card,
  ConfirmDialog,
  Dropdown,
  EmptyState,
  ErrorState,
  IconButton,
  InfoList,
  InfoRow,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableSkeleton,
} from '@/components/common'
import type { DropdownItem } from '@/components/common'
import {
  AccessEventBadge,
  AccessResultBadge,
  RiskBadge,
  TrustStatusBadge,
} from '@/components/security/SecurityBadges'
import { useToast } from '@/context/ToastContext'
import {
  useAsync,
  useCopyToClipboard,
  useDebouncedValue,
  useDocumentTitle,
  useIsMobile,
  usePagination,
} from '@/hooks'
import { toApiError } from '@/services'
import { devicesService } from '@/services/devices.service'
import { DEVICE_TYPE_LABEL, TRUST_STATUS_META } from '@/utils/labels'
import { formatDateTime, formatRelativeTime } from '@/utils/format'
import type { Device, DeviceType, TrustStatus } from '@/types'

const DEVICE_ICONS: Record<DeviceType, LucideIcon> = {
  desktop: Monitor,
  laptop: Laptop,
  tablet: Tablet,
  mobile: Smartphone,
  unknown: MonitorSmartphone,
}

const TRUST_OPTIONS = [
  { value: 'all', label: 'All trust states' },
  ...(Object.keys(TRUST_STATUS_META) as TrustStatus[]).map((value) => ({
    value,
    label: TRUST_STATUS_META[value].label,
  })),
]

type PendingAction = { kind: 'trust'; device: Device; trust: TrustStatus }

interface DeviceHandlers {
  onOpen: () => void
  onTrust: (trust: TrustStatus) => void
}

function buildDeviceActions(device: Device, handlers: DeviceHandlers): DropdownItem[] {
  return [
    {
      id: 'details',
      label: 'View details',
      icon: <History size={15} />,
      onSelect: handlers.onOpen,
    },
    {
      id: 'trusted',
      label: 'Mark expected',
      icon: <ShieldCheck size={15} />,
      onSelect: () => handlers.onTrust('trusted'),
      disabled: device.trustStatus === 'trusted',
    },
    {
      id: 'suspicious',
      label: 'Flag suspicious',
      icon: <ShieldAlert size={15} />,
      onSelect: () => handlers.onTrust('suspicious'),
      disabled: device.trustStatus === 'suspicious',
    },
  ]
}

/** Truncated monospace identifier with inline copy affordance. */
function IdentifierCell({ value }: { value: string }) {
  const { copied, copy } = useCopyToClipboard()
  const toast = useToast()

  const handleCopy = async () => {
    const ok = await copy(value)
    if (ok) toast.success('Copied', 'Device identifier copied to clipboard.')
    else toast.error('Copy failed', 'Your browser blocked clipboard access.')
  }

  return (
    <div className="flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
      <span title={value} className="max-w-[136px] truncate font-mono text-[12px] text-ink-soft">
        {value}
      </span>
      <IconButton label="Copy device identifier" size="sm" onClick={handleCopy}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </IconButton>
    </div>
  )
}

const ROW_ACTION_WRAP = (device: Device, handlers: DeviceHandlers) => (
  <div onClick={(event) => event.stopPropagation()}>
    <Dropdown
      trigger={({ toggle }) => (
        <IconButton label={`Actions for ${device.label}`} size="sm" onClick={toggle}>
          <MoreHorizontal size={16} />
        </IconButton>
      )}
      items={buildDeviceActions(device, handlers)}
    />
  </div>
)

/** Timestamped capture timeline for one device — correlated audit evidence. */
function DeviceHistoryTimeline({ deviceId }: { deviceId: string }) {
  const { data, loading, error, reload } = useAsync(
    () => devicesService.history(deviceId),
    [deviceId],
  )

  if (loading) return <TableSkeleton rows={4} columns={2} />

  if (error) {
    return (
      <ErrorState
        error={error}
        title="Could not load device history"
        onRetry={() => void reload()}
        className="py-8"
      />
    )
  }

  const events = data?.events ?? []

  if (events.length === 0) {
    return (
      <EmptyState
        icon={<History size={20} />}
        title="No recorded activity"
        description="This device has no access events correlated in the audit log yet."
      />
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-[12.5px] text-ink-muted">
        {data?.total ?? events.length} captured{' '}
        {(data?.total ?? events.length) === 1 ? 'event' : 'events'}, newest first.
      </p>
      <ol className="relative space-y-4 border-l border-line pl-5">
        {events.map((event) => (
          <li key={event.id} className="relative">
            <span className="absolute top-1.5 -left-[26px] size-3 rounded-full bg-brand-500 ring-4 ring-surface" />
            <div className="flex flex-wrap items-center gap-1.5">
              <AccessEventBadge event={event.eventType} />
              <AccessResultBadge result={event.result} />
              <RiskBadge level={event.riskLevel} />
            </div>
            <p className="mt-1.5 truncate text-[13px] font-medium text-ink">{event.fileName}</p>
            <p className="text-[12px] text-ink-muted">
              {formatDateTime(event.occurredAt)} · {formatRelativeTime(event.occurredAt)}
            </p>
            <p className="font-mono text-[11.5px] text-ink-muted">
              {event.ip}
              {event.location ? ` · ${event.location}` : ''}
            </p>
          </li>
        ))}
      </ol>
    </div>
  )
}

/**
 * Captured-device register. Device identity is traceability evidence for the
 * audit trail — never an authentication factor. Operators annotate records
 * (expected/suspicious) and pivot into the access log; access itself is
 * governed by the single-use link and its one authorized session.
 */
export default function DevicesPage() {
  useDocumentTitle('Device records')
  const toast = useToast()
  const isMobile = useIsMobile()

  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput, 350)
  const [trustFilter, setTrustFilter] = useState<string>('all')
  const { page, pageSize, setPage, setPageSize, reset } = usePagination(8)

  const [pending, setPending] = useState<PendingAction | null>(null)
  const [detail, setDetail] = useState<Device | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    reset()
  }, [debouncedSearch, trustFilter, reset])

  const { data, loading, error, reload } = useAsync(
    () =>
      devicesService.list({
        page,
        pageSize,
        search: debouncedSearch || undefined,
        trustStatus: trustFilter === 'all' ? undefined : trustFilter,
      }),
    [page, pageSize, debouncedSearch, trustFilter],
  )

  const counts = useAsync(async () => {
    const [all, suspicious] = await Promise.all([
      devicesService.list({ pageSize: 1 }),
      devicesService.list({ trustStatus: 'suspicious', pageSize: 1 }),
    ])
    return { total: all.count, suspicious: suspicious.count }
  }, [])

  const devices = data?.results ?? []
  const totalItems = data?.count ?? 0
  const totalPages = data?.totalPages ?? 1
  const hasFilters = debouncedSearch.length > 0 || trustFilter !== 'all'
  const suspiciousCount = counts.data?.suspicious ?? 0

  const reloadAll = () => Promise.all([reload(), counts.reload()])

  const handleSetTrust = async (device: Device, trust: TrustStatus) => {
    try {
      await devicesService.setTrust(device.id, trust)
      toast.success(
        trust === 'trusted' ? 'Device marked expected' : 'Device flagged suspicious',
        device.label,
      )
      await reloadAll()
    } catch (failure) {
      toast.error('Could not update trust', toApiError(failure).message)
    }
  }

  const handlersFor = (device: Device): DeviceHandlers => ({
    onOpen: () => {
      setShowHistory(false)
      setDetail(device)
    },
    onTrust: (trust) => setPending({ kind: 'trust', device, trust }),
  })

  const trustAction = pending?.kind === 'trust' ? pending : null

  return (
    <div className="space-y-5">
      <PageHeader
        title="Device records"
        description="Every device captured against a protected-image session. Device metadata is audit evidence — it is never used on its own to grant access."
        actions={
          suspiciousCount > 0 ? (
            <Button
              variant="outline"
              leftIcon={<ShieldAlert size={16} />}
              onClick={() => setTrustFilter('suspicious')}
            >
              Review suspicious
            </Button>
          ) : null
        }
      />

      {suspiciousCount > 0 ? (
        <Alert
          tone="warning"
          title={`${suspiciousCount} suspicious ${suspiciousCount === 1 ? 'device' : 'devices'} need review`}
          actions={
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTrustFilter('suspicious')}
            >
              Show suspicious devices
            </Button>
          }
        >
          Devices are flagged suspicious when a consumed link reappears from unfamiliar hardware or
          after repeated failed authentications. Confirm each one belongs to its recipient.
        </Alert>
      ) : null}

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-xs">
            <SearchInput
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onClear={() => setSearchInput('')}
              placeholder="Search devices, recipients or identifiers…"
              aria-label="Search devices"
            />
          </div>
          <Select
            aria-label="Filter by trust status"
            className="w-auto min-w-[176px]"
            value={trustFilter}
            options={TRUST_OPTIONS}
            onChange={(event) => setTrustFilter(event.target.value)}
          />
        </div>

        {loading ? (
          <TableSkeleton rows={pageSize} columns={9} />
        ) : error ? (
          <ErrorState
            error={error}
            title="Could not load device records"
            onRetry={() => void reload()}
            className="py-12"
          />
        ) : devices.length === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={<MonitorSmartphone size={20} />}
              title="No devices match these filters"
              description="Try a different search term, or clear the trust filter."
            />
          ) : (
            <EmptyState
              icon={<MonitorSmartphone size={20} />}
              title="No device records yet"
              description="Devices appear here once a recipient opens your single-use link."
            />
          )
        ) : isMobile ? (
          <ul className="divide-y divide-line">
            {devices.map((device) => {
              const Icon = DEVICE_ICONS[device.deviceType]
              return (
                <li key={device.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetail(device)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setDetail(device)
                      }
                    }}
                    className="flex flex-col gap-3 p-4 transition-colors hover:bg-surface-subtle/60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-subtle text-ink-soft ring-1 ring-line">
                          <Icon size={15} />
                        </span>
                        <div className="min-w-0">
                          <span className="block truncate text-[13px] font-medium text-ink">
                            {device.label}
                          </span>
                          <p className="text-[11.5px] text-ink-muted">
                            {DEVICE_TYPE_LABEL[device.deviceType]} · {device.os}
                          </p>
                        </div>
                      </div>
                      {ROW_ACTION_WRAP(device, handlersFor(device))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <TrustStatusBadge status={device.trustStatus} />
                    </div>
                    <div className="flex items-center justify-between gap-3 text-[12px] text-ink-muted">
                      <span className="truncate font-mono">{device.ownerUsername}</span>
                      <span className="shrink-0">{formatRelativeTime(device.lastActiveAt)}</span>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <Table>
            <TableHead>
              <TableHeaderCell>Device</TableHeaderCell>
              <TableHeaderCell>Identifier</TableHeaderCell>
              <TableHeaderCell>OS</TableHeaderCell>
              <TableHeaderCell>Browser</TableHeaderCell>
              <TableHeaderCell>Recipient</TableHeaderCell>
              <TableHeaderCell>First seen</TableHeaderCell>
              <TableHeaderCell>Last active</TableHeaderCell>
              <TableHeaderCell>Trust</TableHeaderCell>
              <TableHeaderCell align="right">Actions</TableHeaderCell>
            </TableHead>
            <TableBody>
              {devices.map((device) => {
                const Icon = DEVICE_ICONS[device.deviceType]
                return (
                  <TableRow key={device.id} interactive onClick={() => setDetail(device)}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-subtle text-ink-soft ring-1 ring-line">
                          <Icon size={15} />
                        </span>
                        <div className="min-w-0">
                          <span className="block truncate text-[13px] font-medium text-ink">
                            {device.label}
                          </span>
                          <p className="text-[11.5px] text-ink-muted">
                            {DEVICE_TYPE_LABEL[device.deviceType]}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <IdentifierCell value={device.deviceIdentifier} />
                    </TableCell>
                    <TableCell>{device.os}</TableCell>
                    <TableCell>{device.browser}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={device.ownerUsername} size="sm" />
                        <span className="truncate font-mono text-[12.5px] text-ink-soft">
                          {device.ownerUsername}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-[12.5px] text-ink-muted whitespace-nowrap">
                      {formatDateTime(device.firstSeenAt)}
                    </TableCell>
                    <TableCell className="text-[12.5px] text-ink-muted whitespace-nowrap">
                      {formatRelativeTime(device.lastActiveAt)}
                    </TableCell>
                    <TableCell>
                      <TrustStatusBadge status={device.trustStatus} />
                    </TableCell>
                    <TableCell align="right">{ROW_ACTION_WRAP(device, handlersFor(device))}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}

        {!loading && !error && devices.length > 0 ? (
          <Pagination
            page={page}
            pageSize={pageSize}
            totalItems={totalItems}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemLabel="devices"
          />
        ) : null}
      </Card>

      <Modal
        open={Boolean(detail)}
        onClose={() => {
          setDetail(null)
          setShowHistory(false)
        }}
        title={showHistory ? `${detail?.label ?? ''} · history` : detail?.label}
        description={detail ? DEVICE_TYPE_LABEL[detail.deviceType] : undefined}
        size="md"
        footer={
          <>
            {showHistory ? (
              <Button variant="ghost" onClick={() => setShowHistory(false)}>
                Back to details
              </Button>
            ) : (
              <Button
                variant="ghost"
                leftIcon={<History size={15} />}
                onClick={() => setShowHistory(true)}
              >
                View full history
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setDetail(null)
                setShowHistory(false)
              }}
            >
              Close
            </Button>
          </>
        }
      >
        {detail ? (
          showHistory ? (
            <DeviceHistoryTimeline deviceId={detail.id} />
          ) : (
            <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <TrustStatusBadge status={detail.trustStatus} />
            </div>

            <div className="rounded-lg border border-line bg-surface-subtle px-3.5 py-2.5">
              <p className="mb-1 text-[11.5px] font-medium tracking-wide text-ink-muted uppercase">
                Device identifier
              </p>
              <code className="font-mono text-[12.5px] break-all text-ink">
                {detail.deviceIdentifier}
              </code>
            </div>

            <div className="grid gap-x-6 sm:grid-cols-2">
              <InfoList>
                <InfoRow label="Recipient username" value={detail.ownerUsername} mono />
                <InfoRow label="Operating system" value={detail.os} />
                <InfoRow label="Browser" value={detail.browser} />
                <InfoRow label="Location" value={detail.location ?? '—'} />
              </InfoList>
              <InfoList>
                <InfoRow label="IP address" value={detail.ip ?? '—'} mono />
                <InfoRow label="First seen" value={formatDateTime(detail.firstSeenAt)} />
                <InfoRow label="Last active" value={formatRelativeTime(detail.lastActiveAt)} />
                <InfoRow label="Trust" value={<TrustStatusBadge status={detail.trustStatus} />} />
              </InfoList>
            </div>

            <p className="rounded-lg bg-surface-subtle px-3.5 py-3 text-[12.5px] leading-5 text-ink-muted">
              This record is currently{' '}
              <span className="font-medium text-ink-soft">
                {TRUST_STATUS_META[detail.trustStatus].label.toLowerCase()}
              </span>
              . Device metadata is captured for the audit trail and never grants access on its own —
              access is always governed by the single-use link and its one authorized session. First
              seen {formatRelativeTime(detail.firstSeenAt)}, last active{' '}
              {formatRelativeTime(detail.lastActiveAt)}.
            </p>
            </div>
          )
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(trustAction)}
        onClose={() => setPending(null)}
        onConfirm={async () => {
          if (trustAction) await handleSetTrust(trustAction.device, trustAction.trust)
        }}
        title={trustAction?.trust === 'trusted' ? 'Mark device expected?' : 'Flag device as suspicious?'}
        description={
          trustAction?.trust === 'trusted'
            ? `Mark “${trustAction?.device.label ?? 'this device'}” as expected? Future access from it will be treated as normal activity.`
            : `Flag “${trustAction?.device.label ?? 'this device'}” as suspicious? You will be alerted on any further activity from it.`
        }
        confirmLabel={trustAction?.trust === 'trusted' ? 'Mark expected' : 'Flag suspicious'}
        tone={trustAction?.trust === 'suspicious' ? 'danger' : 'primary'}
      />
    </div>
  )
}
