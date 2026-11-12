import { Badge } from '@/components/common/Badge'
import {
  ACCESS_EVENT_META,
  ACCESS_RESULT_META,
  LINK_STATE_META,
  NOTIFICATION_SEVERITY_META,
  PROTECTION_STATUS_META,
  RISK_LEVEL_META,
  TRUST_STATUS_META,
  WATERMARK_VERIFICATION_META,
} from '@/utils/labels'
import type {
  AccessEventType,
  AccessResult,
  LinkState,
  NotificationSeverity,
  ProtectionStatus,
  RiskLevel,
  TrustStatus,
  WatermarkVerification,
} from '@/types'

export function AccessEventBadge({ event, className }: { event: AccessEventType; className?: string }) {
  const meta = ACCESS_EVENT_META[event]
  return (
    <Badge tone={meta.tone} className={className}>
      {meta.label}
    </Badge>
  )
}

export function AccessResultBadge({ result, className }: { result: AccessResult; className?: string }) {
  const meta = ACCESS_RESULT_META[result]
  return (
    <Badge tone={meta.tone} dot className={className}>
      {meta.label}
    </Badge>
  )
}

export function RiskBadge({ level, className }: { level: RiskLevel; className?: string }) {
  const meta = RISK_LEVEL_META[level]
  return (
    <Badge tone={meta.tone} size="sm" className={className}>
      {meta.label}
    </Badge>
  )
}

export function ProtectionStatusBadge({
  status,
  className,
}: {
  status: ProtectionStatus
  className?: string
}) {
  const meta = PROTECTION_STATUS_META[status]
  return (
    <Badge tone={meta.tone} dot className={className}>
      {meta.label}
    </Badge>
  )
}

export function LinkStateBadge({ state, className }: { state: LinkState; className?: string }) {
  const meta = LINK_STATE_META[state]
  return (
    <Badge tone={meta.tone} dot className={className}>
      {meta.label}
    </Badge>
  )
}

export function TrustStatusBadge({ status, className }: { status: TrustStatus; className?: string }) {
  const meta = TRUST_STATUS_META[status]
  return (
    <Badge tone={meta.tone} className={className}>
      {meta.label}
    </Badge>
  )
}

export function WatermarkVerificationBadge({
  status,
  className,
}: {
  status: WatermarkVerification
  className?: string
}) {
  const meta = WATERMARK_VERIFICATION_META[status]
  return (
    <Badge tone={meta.tone} className={className}>
      {meta.label}
    </Badge>
  )
}

export function SeverityBadge({
  severity,
  className,
}: {
  severity: NotificationSeverity
  className?: string
}) {
  const meta = NOTIFICATION_SEVERITY_META[severity]
  return (
    <Badge tone={meta.tone} size="sm" className={className}>
      {meta.label}
    </Badge>
  )
}
