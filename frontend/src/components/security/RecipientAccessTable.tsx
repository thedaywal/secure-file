import { Ban, CheckCircle2, Globe, Monitor, Trash2 } from 'lucide-react'

import {
  Avatar,
  Badge,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableSkeleton,
} from '@/components/common'
import { formatDateTime, formatRelativeTime } from '@/utils/format'
import type { AccessLog, RecipientSummary } from '@/types'

export interface RecipientAccessTableProps {
  summaries: RecipientSummary[]
  loading?: boolean
  onRowClick?: (log: AccessLog) => void
  /** When provided, renders a per-line delete action. */
  onDelete?: (log: AccessLog) => void
  /** When provided, renders a per-line "block this address" action. */
  onBlockIP?: (log: AccessLog) => void
  /** Addresses already on the blocklist, so the block action can be disabled. */
  blockedAddresses?: string[]
  emptyState?: React.ReactNode
}

interface SummaryLine {
  kind: 'opened' | 'reuse'
  log: AccessLog
}

/** The (at most two) lines a recipient is collapsed to, in display order. */
function linesOf(summary: RecipientSummary): SummaryLine[] {
  const lines: SummaryLine[] = []
  if (summary.opened) lines.push({ kind: 'opened', log: summary.opened })
  if (summary.reuse) lines.push({ kind: 'reuse', log: summary.reuse })
  return lines
}

/**
 * Recipient-first access view. Each recipient collapses to at most two lines —
 * "Link opened" (link consumed successfully) and "Link reuse" (blocked). The
 * recipient cell spans both lines so they read as a single entry, and the
 * event/result columns carry only those two outcomes.
 */
export function RecipientAccessTable({
  summaries,
  loading,
  onRowClick,
  onDelete,
  onBlockIP,
  blockedAddresses = [],
  emptyState,
}: RecipientAccessTableProps) {
  const showActions = Boolean(onDelete || onBlockIP)
  const columnCount = 7 + (showActions ? 1 : 0)

  if (loading) return <TableSkeleton rows={6} columns={columnCount} />

  return (
    <Table>
      <TableHead>
        <TableHeaderCell>Recipient</TableHeaderCell>
        <TableHeaderCell>File</TableHeaderCell>
        <TableHeaderCell>Device / Browser</TableHeaderCell>
        <TableHeaderCell>Network</TableHeaderCell>
        <TableHeaderCell>Event</TableHeaderCell>
        <TableHeaderCell>Result</TableHeaderCell>
        <TableHeaderCell align="right">Timestamp</TableHeaderCell>
        {showActions ? <TableHeaderCell align="right">Actions</TableHeaderCell> : null}
      </TableHead>
      <TableBody>
        {summaries.length === 0 ? (
          <TableEmptyRow colSpan={columnCount}>
            {emptyState ?? (
              <p className="px-5 py-10 text-center text-[13px] text-ink-muted">
                No access activity matches the current filters.
              </p>
            )}
          </TableEmptyRow>
        ) : (
          summaries.map((summary) => {
            const lines = linesOf(summary)
            return lines.map((line, index) => (
              <TableRow
                key={`${summary.recipientUsername}-${line.kind}`}
                interactive={Boolean(onRowClick)}
                onClick={onRowClick ? () => onRowClick(line.log) : undefined}
              >
                {index === 0 ? (
                  <TableCell rowSpan={lines.length} className="align-top">
                    <div className="flex items-start gap-2.5">
                      <Avatar name={summary.recipientUsername} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-mono text-[12.5px] font-medium text-ink">
                          {summary.recipientUsername}
                        </p>
                        <p className="truncate text-[11.5px] text-ink-muted">
                          {lines.length > 1 ? 'Opened + reuse' : 'Opened'}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                ) : null}

                <TableCell>
                  <p className="max-w-[190px] truncate text-[13px] text-ink-soft">
                    {line.log.fileName}
                  </p>
                  {line.log.shareId ? (
                    <p className="font-mono text-[11px] text-ink-muted">{line.log.shareId}</p>
                  ) : null}
                </TableCell>

                <TableCell>
                  <div className="flex items-start gap-2">
                    <Monitor size={14} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] text-ink-soft">{line.log.device}</p>
                      <p className="truncate text-[11.5px] text-ink-muted">
                        {line.log.os} · {line.log.browser}
                      </p>
                    </div>
                  </div>
                </TableCell>

                <TableCell>
                  <div className="flex items-start gap-2">
                    <Globe size={14} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
                    <div className="min-w-0">
                      <p className="font-mono text-[12px] text-ink-soft">{line.log.ip}</p>
                      <p className="truncate text-[11.5px] text-ink-muted">
                        {line.log.location ?? '—'}
                      </p>
                    </div>
                  </div>
                </TableCell>

                <TableCell>
                  {line.kind === 'opened' ? (
                    <Badge tone="neutral">Link opened</Badge>
                  ) : (
                    <Badge tone="danger">Link reuse</Badge>
                  )}
                </TableCell>

                <TableCell>
                  {line.kind === 'opened' ? (
                    <Badge tone="success" icon={<CheckCircle2 size={13} />}>
                      Link consumed
                    </Badge>
                  ) : (
                    <Badge tone="danger" icon={<Ban size={13} />}>
                      Blocked
                    </Badge>
                  )}
                </TableCell>

                <TableCell align="right">
                  <p className="text-[12.5px] whitespace-nowrap text-ink-soft">
                    {formatDateTime(line.log.occurredAt)}
                  </p>
                  <p className="text-[11.5px] whitespace-nowrap text-ink-muted">
                    {formatRelativeTime(line.log.occurredAt)}
                  </p>
                </TableCell>

                {showActions ? (
                  <TableCell align="right">
                    <div
                      className="flex items-center justify-end gap-1"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {onBlockIP ? (
                        <IconButton
                          label={`Block address ${line.log.ip}`}
                          size="sm"
                          variant="ghost"
                          disabled={!line.log.ip || blockedAddresses.includes(line.log.ip)}
                          className="text-danger-600 hover:bg-danger-50"
                          onClick={() => onBlockIP(line.log)}
                        >
                          <Ban size={15} />
                        </IconButton>
                      ) : null}
                      {onDelete ? (
                        <IconButton
                          label="Delete access event"
                          size="sm"
                          variant="ghost"
                          className="text-danger-600 hover:bg-danger-50"
                          onClick={() => onDelete(line.log)}
                        >
                          <Trash2 size={15} />
                        </IconButton>
                      ) : null}
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))
          })
        )}
      </TableBody>
    </Table>
  )
}
