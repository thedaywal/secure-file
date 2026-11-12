import { Globe, Monitor } from 'lucide-react'

import {
  Avatar,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableSkeleton,
} from '@/components/common'
import { AccessEventBadge, AccessResultBadge, RiskBadge } from '@/components/security/SecurityBadges'
import { formatDateTime, formatRelativeTime } from '@/utils/format'
import type { AccessLog } from '@/types'

export interface AccessLogTableProps {
  logs: AccessLog[]
  loading?: boolean
  onRowClick?: (log: AccessLog) => void
  /** Hides the file column when the table is already scoped to one file. */
  hideFile?: boolean
  emptyState?: React.ReactNode
}

/** Shared access-monitoring table used by the monitor, file and recipient views. */
export function AccessLogTable({
  logs,
  loading,
  onRowClick,
  hideFile,
  emptyState,
}: AccessLogTableProps) {
  if (loading) return <TableSkeleton rows={6} columns={hideFile ? 6 : 7} />

  const columnCount = hideFile ? 6 : 7

  return (
    <Table>
      <TableHead>
        <TableHeaderCell>Recipient</TableHeaderCell>
        {hideFile ? null : <TableHeaderCell>File</TableHeaderCell>}
        <TableHeaderCell>Device / Browser</TableHeaderCell>
        <TableHeaderCell>Network</TableHeaderCell>
        <TableHeaderCell>Event</TableHeaderCell>
        <TableHeaderCell>Result</TableHeaderCell>
        <TableHeaderCell align="right">Timestamp</TableHeaderCell>
      </TableHead>
      <TableBody>
        {logs.length === 0 ? (
          <TableEmptyRow colSpan={columnCount}>
            {emptyState ?? (
              <p className="px-5 py-10 text-center text-[13px] text-ink-muted">
                No access activity matches the current filters.
              </p>
            )}
          </TableEmptyRow>
        ) : (
          logs.map((log) => (
            <TableRow
              key={log.id}
              interactive={Boolean(onRowClick)}
              onClick={onRowClick ? () => onRowClick(log) : undefined}
            >
              <TableCell>
                <div className="flex items-center gap-2.5">
                  <Avatar name={log.recipientUsername} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[12.5px] font-medium text-ink">
                      {log.recipientUsername}
                    </p>
                    <p className="truncate text-[11.5px] text-ink-muted">
                      {log.eventType.replace(/-/g, ' ')}
                    </p>
                  </div>
                </div>
              </TableCell>

              {hideFile ? null : (
                <TableCell>
                  <p className="max-w-[190px] truncate text-[13px] text-ink-soft">{log.fileName}</p>
                  {log.shareId ? (
                    <p className="font-mono text-[11px] text-ink-muted">{log.shareId}</p>
                  ) : null}
                </TableCell>
              )}

              <TableCell>
                <div className="flex items-start gap-2">
                  <Monitor size={14} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] text-ink-soft">{log.device}</p>
                    <p className="truncate text-[11.5px] text-ink-muted">
                      {log.os} · {log.browser}
                    </p>
                  </div>
                </div>
              </TableCell>

              <TableCell>
                <div className="flex items-start gap-2">
                  <Globe size={14} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
                  <div className="min-w-0">
                    <p className="font-mono text-[12px] text-ink-soft">{log.ip}</p>
                    <p className="truncate text-[11.5px] text-ink-muted">{log.location ?? '—'}</p>
                  </div>
                </div>
              </TableCell>

              <TableCell>
                <AccessEventBadge event={log.eventType} />
              </TableCell>

              <TableCell>
                <div className="flex flex-wrap items-center gap-1.5">
                  <AccessResultBadge result={log.result} />
                  {log.riskLevel === 'high' || log.riskLevel === 'critical' ? (
                    <RiskBadge level={log.riskLevel} />
                  ) : null}
                  {log.authenticated ? (
                    <Badge tone="neutral" size="sm">
                      Verified
                    </Badge>
                  ) : null}
                </div>
              </TableCell>

              <TableCell align="right">
                <p className="text-[12.5px] whitespace-nowrap text-ink-soft">
                  {formatDateTime(log.occurredAt)}
                </p>
                <p className="text-[11.5px] whitespace-nowrap text-ink-muted">
                  {formatRelativeTime(log.occurredAt)}
                </p>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}
