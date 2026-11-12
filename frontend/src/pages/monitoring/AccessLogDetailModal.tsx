import { Avatar, InfoList, InfoRow, Modal } from '@/components/common'
import { AccessEventBadge, AccessResultBadge, RiskBadge } from '@/components/security/SecurityBadges'
import { formatDateTime, formatRelativeTime } from '@/utils/format'
import type { AccessLog } from '@/types'

export interface AccessLogDetailModalProps {
  log: AccessLog | null
  onClose: () => void
}

/**
 * Full record for a single access event. Reached by clicking a row in the
 * monitoring tables. Shows every field the audit log records — none of it is
 * synthesised client-side.
 */
export function AccessLogDetailModal({ log, onClose }: AccessLogDetailModalProps) {
  return (
    <Modal
      open={Boolean(log)}
      onClose={onClose}
      size="lg"
      title="Access event detail"
      description={log ? formatDateTime(log.occurredAt) : undefined}
    >
      {log ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <AccessEventBadge event={log.eventType} />
            <AccessResultBadge result={log.result} />
            <RiskBadge level={log.riskLevel} />
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-subtle/60 p-3">
            <Avatar name={log.recipientUsername} size="md" />
            <div className="min-w-0">
              <p className="truncate font-mono text-[13.5px] font-semibold text-ink">
                {log.recipientUsername}
              </p>
              <p className="truncate text-[12.5px] text-ink-muted">{log.fileName}</p>
            </div>
            <span className="ml-auto shrink-0 text-[11.5px] text-ink-muted">
              {formatRelativeTime(log.occurredAt)}
            </span>
          </div>

          <div className="grid gap-x-8 gap-y-0 sm:grid-cols-2">
            <InfoList>
              <InfoRow label="Recipient username" value={log.recipientUsername} mono />
              <InfoRow label="IP address" value={log.ip} mono />
              <InfoRow label="Location" value={log.location ?? '—'} />
              <InfoRow label="Device" value={log.device} />
              <InfoRow label="Browser" value={log.browser} />
              <InfoRow label="Operating system" value={log.os} />
            </InfoList>
            <InfoList>
              <InfoRow label="Timestamp" value={formatDateTime(log.occurredAt)} />
              <InfoRow label="File accessed" value={log.fileName} />
              <InfoRow label="Event" value={<AccessEventBadge event={log.eventType} />} />
              <InfoRow label="Access status" value={<AccessResultBadge result={log.result} />} />
              <InfoRow
                label="Authentication status"
                value={log.authenticated ? 'Verified' : 'Unverified'}
              />
              <InfoRow label="Risk level" value={<RiskBadge level={log.riskLevel} />} />
            </InfoList>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}
