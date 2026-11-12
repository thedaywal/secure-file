/**
 * Shared domain types for the SecureFile frontend.
 *
 * These types mirror the proposed Django REST Framework contracts. The backend
 * remains the single source of truth for authentication, authorization,
 * encryption, key release and permanent watermark generation — nothing in this
 * file should be treated as a security boundary.
 */

export type ID = string

/* ------------------------------------------------------------------ *
 * API envelope
 * ------------------------------------------------------------------ */
export interface Paginated<T> {
  count: number
  page: number
  pageSize: number
  totalPages: number
  results: T[]
}

export interface PaginationParams {
  page?: number
  pageSize?: number
  search?: string
  ordering?: string
}

export interface ApiErrorPayload {
  detail?: string
  code?: string
  message?: string
  [field: string]: unknown
}

export interface ApiError {
  status: number
  code: string
  message: string
  /** Field-level validation errors, keyed by form field name. */
  fieldErrors?: Record<string, string[]>
}

/* ------------------------------------------------------------------ *
 * Identity & auth
 * ------------------------------------------------------------------ */
/**
 * SecureFile is a single-administrator platform: there is exactly one
 * administrator account and no public registration.
 */
export type UserRole = 'admin'

export interface User {
  id: ID
  email: string
  fullName: string
  role: UserRole
  avatarUrl?: string
  organization?: string
  jobTitle?: string
  createdAt: string
  lastLoginAt?: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken?: string
  /** ISO timestamp; used to proactively refresh the session. */
  expiresAt?: string
}

export interface AuthSession {
  user: User
  tokens: AuthTokens
}

export interface LoginPayload {
  email: string
  password: string
  remember?: boolean
}

export interface ForgotPasswordPayload {
  email: string
}

export interface ResetPasswordPayload {
  token: string
  password: string
}

/* ------------------------------------------------------------------ *
 * Files — images only
 * ------------------------------------------------------------------ */
/**
 * SecureFile only accepts images. Protected originals are encrypted at rest and
 * never exposed; recipients receive a personalized, watermarked derivative.
 */
export type FileExtension = 'JPG' | 'JPEG' | 'PNG' | 'WEBP'
export type FileKind = 'image'

export type ProtectionStatus =
  | 'protected'
  | 'processing'
  | 'draft'
  | 'expired'
  | 'revoked'

export interface SecureFile {
  id: ID
  name: string
  extension: FileExtension
  kind: FileKind
  mimeType: string
  sizeBytes: number
  uploadedAt: string
  updatedAt?: string
  protectionStatus: ProtectionStatus
  encryption: 'AES-256-GCM'
  authorizedRecipients: number
  activeShareLinks: number
  expiresAt?: string | null
  ownerId: ID
  ownerName?: string
  thumbnailUrl?: string
  checksum?: string
  tags?: string[]
  successfulViews?: number
  failedAttempts?: number
}

export interface FileUploadInput {
  file: File
  name?: string
  tags?: string[]
}

/* ------------------------------------------------------------------ *
 * Protection policies
 * ------------------------------------------------------------------ */
/**
 * Access is governed by four non-negotiable backend rules: image-specific
 * credentials, a single-use link, one active session and administrator
 * revocation. `sessionDurationMinutes` and `expiresAt` are the only tunables.
 */
export interface AccessControlPolicy {
  /** The recipient authenticates with an image-specific username + password. */
  recipientCredentials: true
  /** The access link is atomically consumed on first successful authentication. */
  singleUseLink: true
  /** Exactly one authorized browser session may exist per consumed link. */
  singleActiveSession: true
  /** The administrator may revoke the link or the active session at any time. */
  adminRevocation: true
  /** Minutes a viewing session stays valid after authorization. */
  sessionDurationMinutes: number
  /** Link expiry; `null` means the link never expires on its own. */
  expiresAt: string | null
}

/**
 * Devices are evidence for the audit trail — not an authentication factor.
 */
export interface DeviceControlPolicy {
  /** Capture device, browser and OS metadata alongside every session. */
  recordDeviceMetadata: true
  /** Flag a consumed link that reappears from a different device/browser. */
  flagUnexpectedDevice: boolean
}

/**
 * Delivery restrictions are enforced by the backend for every protected image
 * request. The frontend mirrors them but never acts as the security boundary.
 */
export interface ViewingRestrictionPolicy {
  /** No ordinary download affordance is exposed to the recipient. */
  disableDownloadControls: true
  /** No print affordance is exposed to the recipient. */
  disablePrintControls: true
  /** Content is delivered only through the protected browser viewer. */
  browserViewingOnly: true
  /**
   * Permanent recipient-scoped watermarking. Mandatory: the backend embeds the
   * watermark into the generated image and this flag can never be disabled.
   */
  permanentWatermark: true
}

/** The only approved watermark layout: a repeated diagonal pattern. */
export const WATERMARK_PATTERN = 'repeated-diagonal' as const
export type WatermarkPattern = typeof WATERMARK_PATTERN

export interface WatermarkConfig {
  /** Embed the authenticated recipient's username. Always present. */
  recipientUsername: true
  /** Embed the server-generated access timestamp. Always present. */
  accessTimestamp: true
  /** Embed a short SecureFile reference (file label + access id). */
  secureFileReference: boolean
  /** Repeated diagonal tiling across the entire image. */
  pattern: WatermarkPattern
  /** 0.05 – 0.5; each repetition is semi-transparent but clearly readable. */
  opacity: number
  /** 0.5 – 2; relative scale factor of each repetition. */
  size: number
}

export interface FilePolicy {
  access: AccessControlPolicy
  device: DeviceControlPolicy
  viewing: ViewingRestrictionPolicy
  watermark: WatermarkConfig
}

/* ------------------------------------------------------------------ *
 * Recipients & single-use links
 * ------------------------------------------------------------------ */
/**
 * A link is the delivery mechanism for one recipient of one image. Credentials
 * are image-specific: authorizing a recipient for one image grants no access
 * to any other image.
 */
export type LinkState = 'ACTIVE' | 'CONSUMED' | 'EXPIRED' | 'REVOKED'

export interface RecipientPermissions {
  /** Recipients may only view the watermarked image in the browser. */
  canView: true
  /** Minutes the viewing session stays valid after authorization. */
  sessionDurationMinutes: number
  /** Link expiry; `null` means no automatic expiry. */
  expiresAt: string | null
}

export interface Recipient {
  id: ID
  /** Image-specific credential username, chosen by the administrator. */
  username: string
  /** Optional human-friendly label shown in the admin console. */
  displayName?: string
  fileId: ID
  fileName: string
  permissions: RecipientPermissions
  /** Mirrors the state of the recipient's current link. */
  status: LinkState
  createdAt: string
  /** Set once the recipient has authenticated at least once. */
  lastAuthenticatedAt?: string | null
}

export interface ShareLink {
  id: ID
  fileId: ID
  fileName: string
  fileKind: FileKind
  recipientId: ID
  recipientUsername: string
  /** Per-recipient tunables mirrored from the backing recipient record. */
  permissions: RecipientPermissions
  /** Only the trailing fragment of the token is ever exposed to the UI. */
  tokenPreview: string
  url: string
  state: LinkState
  createdAt: string
  expiresAt: string | null
  /** Timestamp at which the link was consumed by a successful authentication. */
  consumedAt?: string | null
  consumedIp?: string | null
  /** Authorized session bound to this consumed link. */
  sessionId?: string | null
  sessionStartedAt?: string | null
  sessionExpiresAt?: string | null
  successfulViews: number
  failedAttempts: number
  lastAccessedAt?: string | null
}

/* ------------------------------------------------------------------ *
 * Access monitoring
 * ------------------------------------------------------------------ */
export type AccessResult = 'success' | 'failed' | 'blocked'

export const ACCESS_EVENT_TYPES = [
  'successful-access',
  'failed-access',
  'link-opened',
  'link-consumed',
  'link-reuse-blocked',
  'expired-link',
  'revoked-link',
  'unauthorized-device',
  'forwarded-link',
  'download-blocked',
] as const

export type AccessEventType = (typeof ACCESS_EVENT_TYPES)[number]

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface AccessLog {
  id: ID
  recipientUsername: string
  ip: string
  device: string
  deviceType: DeviceType
  browser: string
  os: string
  occurredAt: string
  fileId: ID
  fileName: string
  shareId?: ID
  result: AccessResult
  authenticated: boolean
  eventType: AccessEventType
  riskLevel: RiskLevel
  location?: string
}

export interface AccessLogFilters extends PaginationParams {
  result?: AccessResult | 'all'
  eventType?: AccessEventType | 'all'
  fileId?: ID
  recipientUsername?: string
  dateFrom?: string
  dateTo?: string
}

/* ------------------------------------------------------------------ *
 * Devices — traceability evidence only
 * ------------------------------------------------------------------ */
export type DeviceType = 'desktop' | 'laptop' | 'tablet' | 'mobile' | 'unknown'
export type TrustStatus = 'trusted' | 'untrusted' | 'suspicious'

export interface Device {
  id: ID
  label: string
  deviceIdentifier: string
  deviceType: DeviceType
  os: string
  browser: string
  /** Username of the recipient this device metadata was captured for. */
  ownerUsername: string
  firstSeenAt: string
  lastActiveAt: string
  trustStatus: TrustStatus
  ip?: string
  location?: string
}

/** Correlated capture timeline for one device (access events, newest first). */
export interface DeviceHistory {
  deviceId: ID
  deviceIdentifier: string
  total: number
  events: AccessLog[]
}

/* ------------------------------------------------------------------ *
 * Notifications
 * ------------------------------------------------------------------ */
export const NOTIFICATION_CATEGORIES = [
  'successful-access',
  'unauthorized-access',
  'new-device',
  'link-consumed',
  'link-forwarded',
  'file-expiration',
  'access-revoked',
] as const

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical'

export interface AppNotification {
  id: ID
  category: NotificationCategory
  title: string
  message: string
  createdAt: string
  read: boolean
  severity: NotificationSeverity
  fileId?: ID
  recipientUsername?: string
}

export type DigestFrequency = 'instant' | 'daily' | 'weekly'

export interface NotificationPreference {
  category: NotificationCategory
  email: boolean
  inApp: boolean
  digest: DigestFrequency
}

/* ------------------------------------------------------------------ *
 * Watermark records
 * ------------------------------------------------------------------ */
export type WatermarkVerification = 'verified' | 'unverified' | 'mismatch'

export interface WatermarkRecord {
  id: ID
  fileId: ID
  fileName: string
  fileKind: FileKind
  extension: FileExtension
  /** Authenticated recipient the derivative was personalized for. */
  recipientUsername: string
  /** Unique access/session identifier bound to this rendition. */
  accessId: string
  sessionId: string
  /** Server-side timestamp embedded into the image pixels. */
  generatedAt: string
  /** SHA-256 hash of the generated, watermarked image. */
  outputHash: string
  hashAlgorithm: 'SHA-256'
  verificationStatus: WatermarkVerification
  pattern: WatermarkPattern
  opacity: number
  size: number
  sizeBytes: number
  /** Backend-rendered, watermarked rendition preview. */
  previewUrl?: string
}

/**
 * Result of an administrator "is this leaked image one of ours?" investigation.
 */
export interface WatermarkLookupResult {
  /** Stored record matched by the supplied hash or access id, if any. */
  record: WatermarkRecord | null
  /** Whether the supplied SHA-256 matches the stored record exactly. */
  hashMatches: boolean
  /** Extracted watermark lines the administrator claims to have read. */
  extractedLines: string[]
  /** Human-readable summary of the comparison. */
  summary: string
}

/* ------------------------------------------------------------------ *
 * Dashboard analytics
 * ------------------------------------------------------------------ */
export interface DashboardMetrics {
  totalProtectedFiles: number
  activeShareLinks: number
  authorizedRecipients: number
  successfulAccess: number
  failedAccess: number
  activeSessions: number
}

export interface MetricDelta {
  value: number
  direction: 'up' | 'down' | 'flat'
}

export interface AccessActivityPoint {
  date: string
  successful: number
  failed: number
}

export interface EventBreakdownPoint {
  eventType: AccessEventType
  label: string
  count: number
}

export interface DashboardSummary {
  metrics: DashboardMetrics
  deltas: Partial<Record<keyof DashboardMetrics, MetricDelta>>
  accessActivity: AccessActivityPoint[]
  accessOutcome: { name: string; value: number; tone: 'success' | 'failed' | 'blocked' }[]
  eventBreakdown: EventBreakdownPoint[]
  topFiles: { id: ID; name: string; extension: FileExtension; views: number; failed: number }[]
}

/* ------------------------------------------------------------------ *
 * Public recipient viewer
 * ------------------------------------------------------------------ */
export type ViewerState =
  | 'validating'
  | 'credentials'
  | 'authorized'
  | 'consumed'
  | 'access-denied'
  | 'expired'
  | 'revoked'
  | 'session-ended'
  | 'invalid'
  | 'error'

export interface ViewerLinkContext {
  fileId: ID
  fileName: string
  fileKind: FileKind
  extension: FileExtension
  ownerName: string
  organization?: string
  /** Current link state as reported by the backend when the link is resolved. */
  state: LinkState | 'INVALID'
  expiresAt: string | null
}

export interface ViewerSession {
  sessionId: string
  fileId: ID
  fileName: string
  fileKind: FileKind
  extension: FileExtension
  /** Short-lived, authenticated content URL issued after authorization. */
  contentUrl: string
  recipientUsername: string
  accessId: string
  /** Repeated diagonal watermark lines: username + server access timestamp. */
  watermarkLines: string[]
  startedAt: string
  expiresAt: string
  /** Seconds remaining in the viewing session. */
  remainingSeconds: number
}

export interface ViewerViewEvent {
  event: 'opened' | 'closed' | 'rendered' | 'blocked-action'
  detail?: string
}
