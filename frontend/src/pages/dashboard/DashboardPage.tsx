import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  FolderLock,
  Link2,
  MonitorSmartphone,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldPlus,
  Users,
} from 'lucide-react'

import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  Progress,
  SegmentedControl,
  StatCard,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableSkeleton,
} from '@/components/common'
import { AccessOutcomeChart, AccessTrendChart, EventBreakdownChart } from '@/components/dashboard'
import { FileTypeIcon } from '@/components/files/FileTypeIcon'
import { AccessEventBadge, AccessResultBadge, RiskBadge } from '@/components/security/SecurityBadges'
import { useAuth } from '@/context/AuthContext'
import { useAsync, useDocumentTitle } from '@/hooks'
import { adminPath } from '@/routes/navigation'
import { accessService } from '@/services/access.service'
import { dashboardService } from '@/services/dashboard.service'
import { formatNumber, formatRelativeTime } from '@/utils/format'
import { ACCESS_EVENT_META } from '@/utils/labels'
import type { ToneIntent } from '@/utils/labels'
import type { AccessLog, DashboardMetrics, RiskLevel } from '@/types'

type RangeOption = '7' | '14' | '30'

const RANGE_OPTIONS: { value: RangeOption; label: string }[] = [
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
]

const POSTURE_FACTS = [
  'Encryption at rest · AES-256-GCM',
  'Permanent recipient watermarking enforced',
  'Immutable audit logging enabled',
]

const RISK_ORDER: Record<RiskLevel, number> = { critical: 0, high: 1, medium: 2, low: 3 }

const EMPTY_LOGS: AccessLog[] = []

interface StatConfig {
  key: keyof DashboardMetrics
  label: string
  icon: ReactNode
  tone: ToneIntent
  hint: string
}

export default function DashboardPage() {
  useDocumentTitle('Dashboard')
  const { user } = useAuth()
  const navigate = useNavigate()

  const [range, setRange] = useState<RangeOption>('14')

  const summary = useAsync(() => dashboardService.summary(), [])
  const recent = useAsync(() => accessService.recent(8), [])

  const workspace = user?.organization ?? user?.fullName ?? 'your workspace'

  const metrics = summary.data?.metrics
  const deltas = summary.data?.deltas ?? {}

  const activity = useMemo(
    () => summary.data?.accessActivity.slice(-Number(range)) ?? [],
    [summary.data, range],
  )

  const topFiles = summary.data?.topFiles ?? []

  const eventBreakdown = useMemo(
    () => [...(summary.data?.eventBreakdown ?? [])].sort((a, b) => b.count - a.count),
    [summary.data],
  )
  const topEvents = eventBreakdown.slice(0, 4)

  const logs = recent.data ?? EMPTY_LOGS
  const recentTable = logs.slice(0, 6)

  const alerts = useMemo(
    () =>
      logs
        .filter((log) => log.riskLevel === 'high' || log.riskLevel === 'critical')
        .slice()
        .sort(
          (a, b) =>
            RISK_ORDER[a.riskLevel] - RISK_ORDER[b.riskLevel] ||
            (a.occurredAt < b.occurredAt ? 1 : -1),
        )
        .slice(0, 5),
    [logs],
  )

  const activeSessionsTone: ToneIntent =
    deltas.activeSessions?.direction === 'down' ? 'warning' : 'brand'

  const statCards: StatConfig[] = [
    {
      key: 'totalProtectedFiles',
      label: 'Total protected files',
      icon: <FolderLock size={16} />,
      tone: 'brand',
      hint: 'in this workspace',
    },
    {
      key: 'activeShareLinks',
      label: 'Active sharing links',
      icon: <Link2 size={16} />,
      tone: 'brand',
      hint: 'live recipient links',
    },
    {
      key: 'authorizedRecipients',
      label: 'Authorized recipients',
      icon: <Users size={16} />,
      tone: 'brand',
      hint: 'across all files',
    },
    {
      key: 'successfulAccess',
      label: 'Successful access attempts',
      icon: <ShieldCheck size={16} />,
      tone: 'success',
      hint: 'authenticated deliveries',
    },
    {
      key: 'failedAccess',
      label: 'Failed access attempts',
      icon: <ShieldAlert size={16} />,
      tone: 'danger',
      hint: 'review in monitoring',
    },
    {
      key: 'activeSessions',
      label: 'Active viewing sessions',
      icon: <MonitorSmartphone size={16} />,
      tone: activeSessionsTone,
      hint: 'in progress right now',
    },
  ]

  const handleRefresh = () => {
    void summary.reload()
    void recent.reload()
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Security dashboard"
        description={
          <>
            Protection status, access activity and elevated-risk signals for{' '}
            <span className="font-medium text-ink-soft">{workspace}</span>.
          </>
        }
        actions={
          <>
            <SegmentedControl
              value={range}
              onChange={setRange}
              options={RANGE_OPTIONS}
              size="sm"
              aria-label="Activity time range"
            />
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw size={14} />}
              loading={summary.loading || recent.loading}
              onClick={handleRefresh}
            >
              Refresh
            </Button>
            <Link to={adminPath('/files/new')}>
              <Button size="sm" leftIcon={<ShieldPlus size={14} />}>
                Protect a file
              </Button>
            </Link>
          </>
        }
      />

      {summary.error ? (
        <Card padded>
          <ErrorState error={summary.error} onRetry={handleRefresh} retryLabel="Retry" />
        </Card>
      ) : (
        <>
          <Card padded className="animate-fade-in">
            <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8">
              {POSTURE_FACTS.map((fact) => (
                <li key={fact} className="flex items-center gap-2 text-[12.5px] text-ink-soft">
                  <CheckCircle2 size={15} className="shrink-0 text-success-600" />
                  {fact}
                </li>
              ))}
            </ul>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {statCards.map((config) => (
              <StatCard
                key={config.key}
                label={config.label}
                value={metrics?.[config.key] ?? 0}
                icon={config.icon}
                tone={config.tone}
                delta={deltas[config.key]}
                hint={config.hint}
                loading={summary.loading}
              />
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Access activity"
                description={`Successful and failed attempts over the last ${range} days`}
              />
              <CardBody>
                <AccessTrendChart data={activity} loading={summary.loading} />
              </CardBody>
            </Card>

            <Card className="xl:col-span-1">
              <CardHeader title="Access outcome" description="Result split across all attempts" />
              <CardBody>
                <AccessOutcomeChart
                  data={summary.data?.accessOutcome ?? []}
                  loading={summary.loading}
                />
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title="Event breakdown" description="Access events grouped by type" />
            <CardBody>
              <EventBreakdownChart data={eventBreakdown} loading={summary.loading} />
              {topEvents.length > 0 ? (
                <ul className="mt-5 space-y-3 border-t border-line pt-4">
                  {topEvents.map((point) => {
                    const meta = ACCESS_EVENT_META[point.eventType]
                    return (
                      <li key={point.eventType} className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                          <p className="text-[12.5px] leading-5 text-ink-muted">{meta.description}</p>
                        </div>
                        <span className="shrink-0 pt-0.5 text-[13px] font-semibold text-ink tabular-nums">
                          {formatNumber(point.count)}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Recent security alerts"
              description="Highest-risk activity in the last 7 days"
              actions={
                <Link to={adminPath('/monitoring')}>
                  <Button variant="ghost" size="sm" rightIcon={<ArrowUpRight size={14} />}>
                    View monitoring
                  </Button>
                </Link>
              }
            />
            {recent.loading ? (
              <TableSkeleton rows={5} columns={2} />
            ) : alerts.length === 0 ? (
              <EmptyState
                compact
                icon={<AlertTriangle size={18} />}
                title="No elevated-risk activity"
                description="Nothing high-risk was recorded in the recent access window."
              />
            ) : (
              <ul className="divide-y divide-line">
                {alerts.map((log) => (
                  <li key={log.id}>
                    <Link
                      // Account-level events (e.g. a failed sign-in) carry no
                      // file, so they fall back to the monitoring list.
                      to={log.fileId ? adminPath(`/monitoring/files/${log.fileId}`) : adminPath('/monitoring')}
                      className="flex flex-wrap items-center gap-3 px-5 py-3 transition-colors hover:bg-brand-50/40"
                    >
                      <AccessEventBadge event={log.eventType} />
                      <div className="min-w-0">
                        <p className="truncate font-mono text-[12.5px] font-medium text-ink">
                          {log.recipientUsername}
                        </p>
                        <p className="truncate text-[11.5px] text-ink-muted">
                          {log.fileName} · {log.ip}
                        </p>
                      </div>
                      <div className="ml-auto flex items-center gap-3">
                        <span className="whitespace-nowrap text-[11.5px] text-ink-muted">
                          {formatRelativeTime(log.occurredAt)}
                        </span>
                        <RiskBadge level={log.riskLevel} />
                        <ArrowUpRight size={15} className="text-ink-muted" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Recent file activity"
                description="Latest access events across your protected files"
                flush
                actions={
                  <Link to={adminPath('/files')}>
                    <Button variant="ghost" size="sm" rightIcon={<ArrowUpRight size={14} />}>
                      All files
                    </Button>
                  </Link>
                }
              />
              {recent.loading ? (
                <TableSkeleton rows={6} columns={5} />
              ) : (
                <Table>
                  <TableHead>
                    <TableHeaderCell>Recipient</TableHeaderCell>
                    <TableHeaderCell>File</TableHeaderCell>
                    <TableHeaderCell>Event</TableHeaderCell>
                    <TableHeaderCell>Result</TableHeaderCell>
                    <TableHeaderCell align="right">Timestamp</TableHeaderCell>
                  </TableHead>
                  <TableBody>
                    {recentTable.length === 0 ? (
                      <TableEmptyRow colSpan={5}>
                        <EmptyState
                          compact
                          title="No file activity yet"
                          description="Access events will appear here once recipients open your protected files."
                        />
                      </TableEmptyRow>
                    ) : (
                      recentTable.map((log) => (
                        <TableRow
                          key={log.id}
                          interactive
                          onClick={() => navigate(adminPath('/monitoring'))}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <Avatar name={log.recipientUsername} size="sm" />
                              <div className="min-w-0">
                                <p className="truncate font-mono text-[12.5px] font-medium text-ink">
                                  {log.recipientUsername}
                                </p>
                                <p className="truncate text-[11.5px] text-ink-muted">
                                  {log.ip}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="max-w-[200px] truncate text-[13px] text-ink-soft">
                              {log.fileName}
                            </p>
                          </TableCell>
                          <TableCell>
                            <AccessEventBadge event={log.eventType} />
                          </TableCell>
                          <TableCell>
                            <AccessResultBadge result={log.result} />
                          </TableCell>
                          <TableCell align="right">
                            <span className="whitespace-nowrap text-[12.5px] text-ink-soft">
                              {formatRelativeTime(log.occurredAt)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </Card>

            <Card className="xl:col-span-1">
              <CardHeader title="Top protected files" description="Most-viewed renditions" />
              <CardBody className="space-y-4">
                {topFiles.map((file) => {
                  const total = file.views + file.failed
                  return (
                    <div key={file.id}>
                      <div className="flex items-center gap-3">
                        <FileTypeIcon extension={file.extension} size="sm" />
                        <div className="min-w-0 flex-1">
                          <Link
                            to={adminPath(`/files/${file.id}`)}
                            className="block truncate text-[13px] font-medium text-ink transition-colors hover:text-brand-600"
                          >
                            {file.name}
                          </Link>
                          <p className="text-[11.5px] text-ink-muted">
                            {formatNumber(file.views)} views · {formatNumber(file.failed)} failed
                          </p>
                        </div>
                        <Link
                          to={adminPath(`/files/${file.id}`)}
                          aria-label={`Open ${file.name}`}
                          className="text-ink-muted transition-colors hover:text-brand-600"
                        >
                          <ArrowUpRight size={15} />
                        </Link>
                      </div>
                      <Progress
                        value={file.views}
                        max={total || 1}
                        tone="success"
                        size="sm"
                        className="mt-2.5"
                      />
                    </div>
                  )
                })}

                {!summary.loading && topFiles.length === 0 ? (
                  <EmptyState
                    compact
                    title="No protected files yet"
                    description="Upload and protect a file to see its activity here."
                  />
                ) : null}
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
