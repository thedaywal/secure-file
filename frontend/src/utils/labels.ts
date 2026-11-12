import type {
  AccessEventType,
  AccessResult,
  LinkState,
  NotificationCategory,
  NotificationSeverity,
  ProtectionStatus,
  RiskLevel,
  TrustStatus,
  WatermarkPattern,
  WatermarkVerification,
} from '@/types'

export type ToneIntent = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

export interface Meta {
  label: string
  tone: ToneIntent
  description?: string
}

/* ------------------------------------------------------------------ *
 * Access monitoring
 * ------------------------------------------------------------------ */
export const ACCESS_EVENT_META: Record<AccessEventType, Meta> = {
  'successful-access': {
    label: 'Successful access',
    tone: 'success',
    description: 'The recipient authenticated and the protected rendition was delivered.',
  },
  'failed-access': {
    label: 'Failed authentication',
    tone: 'danger',
    description: 'The username/password combination was rejected by the backend.',
  },
  'link-opened': {
    label: 'Link opened',
    tone: 'neutral',
    description: 'The access link was opened. Opening a link does not consume it.',
  },
  'link-consumed': {
    label: 'Link consumed',
    tone: 'brand',
    description: 'The link was atomically consumed by the first successful authentication.',
  },
  'link-reuse-blocked': {
    label: 'Link reuse blocked',
    tone: 'danger',
    description: 'A consumed link was opened again from a different browser or device.',
  },
  'expired-link': {
    label: 'Expired-link attempt',
    tone: 'warning',
    description: 'The link was used after its expiration date.',
  },
  'revoked-link': {
    label: 'Revoked-link attempt',
    tone: 'danger',
    description: 'Access was attempted on a link the administrator has revoked.',
  },
  'unauthorized-device': {
    label: 'Unexpected device',
    tone: 'danger',
    description: 'A consumed link reappeared from a device that never held the session.',
  },
  'forwarded-link': {
    label: 'Forwarded-link attempt',
    tone: 'warning',
    description: 'The link was opened by an identity other than the intended recipient.',
  },
  'download-blocked': {
    label: 'Download blocked',
    tone: 'neutral',
    description: 'A download or print control was intercepted by the protected viewer.',
  },
}

export const ACCESS_RESULT_META: Record<AccessResult, Meta> = {
  success: { label: 'Success', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  blocked: { label: 'Blocked', tone: 'warning' },
}

export const RISK_LEVEL_META: Record<RiskLevel, Meta> = {
  low: { label: 'Low risk', tone: 'neutral' },
  medium: { label: 'Medium risk', tone: 'warning' },
  high: { label: 'High risk', tone: 'danger' },
  critical: { label: 'Critical', tone: 'danger' },
}

/* ------------------------------------------------------------------ *
 * Files & single-use links
 * ------------------------------------------------------------------ */
export const PROTECTION_STATUS_META: Record<ProtectionStatus, Meta> = {
  protected: { label: 'Protected', tone: 'success' },
  processing: { label: 'Processing', tone: 'info' },
  draft: { label: 'Draft', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'warning' },
  revoked: { label: 'Revoked', tone: 'danger' },
}

export const LINK_STATE_META: Record<LinkState, Meta> = {
  ACTIVE: {
    label: 'Active',
    tone: 'success',
    description: 'The link is valid and has not been consumed yet.',
  },
  CONSUMED: {
    label: 'Consumed',
    tone: 'brand',
    description: 'The link was consumed by a successful authentication and cannot be reused.',
  },
  EXPIRED: { label: 'Expired', tone: 'warning', description: 'The link passed its expiry date.' },
  REVOKED: { label: 'Revoked', tone: 'danger', description: 'The administrator revoked the link.' },
}

/* ------------------------------------------------------------------ *
 * Devices — traceability evidence
 * ------------------------------------------------------------------ */
export const DEVICE_TYPE_LABEL: Record<
  'desktop' | 'laptop' | 'tablet' | 'mobile' | 'unknown',
  string
> = {
  desktop: 'Desktop',
  laptop: 'Laptop',
  tablet: 'Tablet',
  mobile: 'Mobile',
  unknown: 'Unknown device',
}

export const TRUST_STATUS_META: Record<TrustStatus, Meta> = {
  trusted: { label: 'Expected', tone: 'success' },
  untrusted: { label: 'Unrecognised', tone: 'neutral' },
  suspicious: { label: 'Suspicious', tone: 'danger' },
}

/* ------------------------------------------------------------------ *
 * Watermarks
 * ------------------------------------------------------------------ */
export const WATERMARK_VERIFICATION_META: Record<WatermarkVerification, Meta> = {
  verified: { label: 'Verified', tone: 'success' },
  unverified: { label: 'Not yet verified', tone: 'neutral' },
  mismatch: { label: 'Hash mismatch', tone: 'danger' },
}

export const WATERMARK_PATTERN_LABEL: Record<WatermarkPattern, string> = {
  'repeated-diagonal': 'Repeated diagonal (tiled)',
}

/* ------------------------------------------------------------------ *
 * Notifications
 * ------------------------------------------------------------------ */
export const NOTIFICATION_CATEGORY_META: Record<NotificationCategory, Meta> = {
  'successful-access': {
    label: 'Successful file access',
    tone: 'success',
    description: 'A recipient authenticated and viewed a protected image.',
  },
  'unauthorized-access': {
    label: 'Unauthorized access attempt',
    tone: 'danger',
    description: 'An unexpected identity or device tried to use a protected link.',
  },
  'new-device': {
    label: 'New device detected',
    tone: 'warning',
    description: 'A consumed link was opened from a device that was never seen before.',
  },
  'link-consumed': {
    label: 'Access link consumed',
    tone: 'info',
    description: 'A single-use link was consumed and its one authorized session opened.',
  },
  'link-forwarded': {
    label: 'Link forwarded',
    tone: 'warning',
    description: 'A protected link was opened by an unexpected identity.',
  },
  'file-expiration': {
    label: 'File expiration',
    tone: 'info',
    description: 'A protected image or link is approaching its expiration date.',
  },
  'access-revoked': {
    label: 'Access revoked',
    tone: 'neutral',
    description: 'Access was revoked for a link or an active session.',
  },
}

export const NOTIFICATION_SEVERITY_META: Record<NotificationSeverity, Meta> = {
  info: { label: 'Info', tone: 'info' },
  success: { label: 'Success', tone: 'success' },
  warning: { label: 'Warning', tone: 'warning' },
  critical: { label: 'Critical', tone: 'danger' },
}

/* ------------------------------------------------------------------ *
 * Generic select options
 * ------------------------------------------------------------------ */
export const PROTECTION_STATUS_OPTIONS = (
  Object.keys(PROTECTION_STATUS_META) as ProtectionStatus[]
).map((value) => ({ value, label: PROTECTION_STATUS_META[value].label }))

export const ACCESS_EVENT_OPTIONS = (Object.keys(ACCESS_EVENT_META) as AccessEventType[]).map(
  (value) => ({ value, label: ACCESS_EVENT_META[value].label }),
)

export const LINK_STATE_OPTIONS = (Object.keys(LINK_STATE_META) as LinkState[]).map((value) => ({
  value,
  label: LINK_STATE_META[value].label,
}))

export const NOTIFICATION_CATEGORY_OPTIONS = (
  Object.keys(NOTIFICATION_CATEGORY_META) as NotificationCategory[]
).map((value) => ({ value, label: NOTIFICATION_CATEGORY_META[value].label }))
