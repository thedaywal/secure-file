/**
 * MOCK ONLY — in-memory implementation of the proposed REST surface.
 *
 * `src/services/*.service.ts` calls the live Django endpoints first and only
 * delegates here when the route is missing (see `withMockFallback`). Delete the
 * `mock` import from a service once that endpoint is live.
 */

import {
  makeAccessId,
  makeHex,
  MOCK_ACCESS_LOGS,
  MOCK_DASHBOARD,
  MOCK_DEVICES,
  MOCK_FILES,
  MOCK_NOTIFICATIONS,
  MOCK_RECIPIENTS,
  MOCK_SHARES,
  MOCK_USER,
  MOCK_WATERMARKS,
  watermarkStampOf,
} from '@/services/mock/data'
import { buildRenditionPreview } from '@/services/mock/previews'
import type {
  AccessLog,
  AccessLogFilters,
  AppNotification,
  AuthSession,
  DashboardSummary,
  Device,
  DeviceHistory,
  FilePolicy,
  FileUploadInput,
  NotificationPreference,
  Paginated,
  PaginationParams,
  Recipient,
  RecipientPermissions,
  SecureFile,
  ShareLink,
  User,
  ViewerLinkContext,
  ViewerSession,
  WatermarkLookupResult,
  WatermarkRecord,
} from '@/types'
import { createDefaultPolicy } from '@/utils/policy'
import { fileKindOf, mimeTypeOf } from '@/utils/format'

const delay = (ms = 240) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/* Mutable in-memory copies so create/revoke/delete actions are reflected. */
const files: SecureFile[] = [...MOCK_FILES]
const shares: ShareLink[] = [...MOCK_SHARES]
const recipients: Recipient[] = [...MOCK_RECIPIENTS]
const accessLogs: AccessLog[] = [...MOCK_ACCESS_LOGS]
const devices: Device[] = [...MOCK_DEVICES]
const notifications: AppNotification[] = [...MOCK_NOTIFICATIONS]
const watermarks: WatermarkRecord[] = [...MOCK_WATERMARKS]
const policies = new Map<string, FilePolicy>()
const viewerSessions = new Map<string, ViewerSession>()
/** Tokens consumed by a successful authentication → their authorized session. */
const consumedTokens = new Map<string, ViewerSession>()

let notificationPreferences: NotificationPreference[] = []

/** Mutable administrator profile so a saved change is reflected in the session. */
let currentUser: User = { ...MOCK_USER }

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */
function paginate<T>(items: T[], page = 1, pageSize = 20): Paginated<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize
  return {
    count: items.length,
    page: safePage,
    pageSize,
    totalPages,
    results: items.slice(start, start + pageSize),
  }
}

function matches(haystack: string, needle?: string): boolean {
  if (!needle) return true
  return haystack.toLowerCase().includes(needle.toLowerCase())
}

function sortByDate<T>(items: T[], key: keyof T, desc = true): T[] {
  return [...items].sort((a, b) => {
    const left = String(a[key] ?? '')
    const right = String(b[key] ?? '')
    return desc ? (left < right ? 1 : -1) : left < right ? -1 : 1
  })
}

export interface MockFileFilters extends PaginationParams {
  status?: string
  kind?: string
}

export interface MockShareFilters extends PaginationParams {
  state?: string
  fileId?: string
}

export interface MockDeviceFilters extends PaginationParams {
  trustStatus?: string
  ownerUsername?: string
}

export interface MockWatermarkFilters extends PaginationParams {
  fileId?: string
  recipientUsername?: string
}

export interface MockNotificationFilters extends PaginationParams {
  category?: string
  unreadOnly?: boolean
}

/* ------------------------------------------------------------------ *
 * Auth — single administrator
 * ------------------------------------------------------------------ */
export async function mockLogin(email: string): Promise<AuthSession> {
  await delay(420)
  return {
    user: { ...currentUser, email },
    tokens: {
      accessToken: `mock.${makeHex(28)}`,
      refreshToken: `mockr.${makeHex(28)}`,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    },
  }
}

export async function mockCurrentUser(): Promise<User> {
  await delay(160)
  return { ...currentUser }
}

export async function mockUpdateProfile(patch: Partial<User>): Promise<User> {
  await delay(280)
  currentUser = { ...currentUser, ...patch }
  return { ...currentUser }
}

export async function mockChangePassword(): Promise<void> {
  await delay(340)
}

export async function mockRevokeAllSessions(): Promise<void> {
  await delay(300)
}

export async function mockNoop(): Promise<void> {
  await delay(180)
}

/* ------------------------------------------------------------------ *
 * Files
 * ------------------------------------------------------------------ */
export async function mockListFiles(params: MockFileFilters = {}): Promise<Paginated<SecureFile>> {
  await delay()
  const filtered = sortByDate(files, 'uploadedAt').filter((file) => {
    const matchesSearch = matches(`${file.name} ${file.extension} ${(file.tags ?? []).join(' ')}`, params.search)
    const matchesStatus = !params.status || params.status === 'all' || file.protectionStatus === params.status
    const matchesKind = !params.kind || params.kind === 'all' || file.kind === params.kind
    return matchesSearch && matchesStatus && matchesKind
  })
  return paginate(filtered, params.page, params.pageSize ?? 8)
}

export async function mockGetFile(id: string): Promise<SecureFile> {
  await delay(180)
  const file = files.find((item) => item.id === id)
  if (!file) throw new Error(`File ${id} not found`)
  return file
}

export async function mockUploadFile(input: FileUploadInput): Promise<SecureFile> {
  await delay(900)
  const extension = (input.file.name.split('.').pop() ?? 'JPG').toUpperCase()
  const created: SecureFile = {
    id: `file_${makeHex(6)}`,
    name: input.name ?? input.file.name.replace(/\.[^.]+$/, ''),
    extension: extension as SecureFile['extension'],
    kind: fileKindOf(extension),
    mimeType: input.file.type || mimeTypeOf(extension),
    sizeBytes: input.file.size,
    uploadedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    protectionStatus: 'draft',
    encryption: 'AES-256-GCM',
    authorizedRecipients: 0,
    activeShareLinks: 0,
    expiresAt: null,
    ownerId: MOCK_USER.id,
    ownerName: MOCK_USER.fullName,
    checksum: `sha256:${makeHex(48)}`,
    tags: input.tags ?? [],
    successfulViews: 0,
    failedAttempts: 0,
  }
  files.unshift(created)
  return created
}

export async function mockUpdateFile(id: string, patch: Partial<SecureFile>): Promise<SecureFile> {
  await delay(220)
  const index = files.findIndex((item) => item.id === id)
  if (index === -1) throw new Error(`File ${id} not found`)
  files[index] = { ...files[index], ...patch, updatedAt: new Date().toISOString() }
  return files[index]
}

export async function mockDeleteFile(id: string): Promise<void> {
  await delay(260)
  const index = files.findIndex((item) => item.id === id)
  if (index !== -1) files.splice(index, 1)
}

export async function mockGetPolicy(id: string): Promise<FilePolicy> {
  await delay(200)
  return policies.get(id) ?? createDefaultPolicy()
}

export async function mockUpdatePolicy(id: string, policy: FilePolicy): Promise<FilePolicy> {
  await delay(320)
  const enforced: FilePolicy = {
    ...policy,
    access: {
      ...policy.access,
      recipientCredentials: true,
      singleUseLink: true,
      singleActiveSession: true,
      adminRevocation: true,
    },
    viewing: { ...policy.viewing, permanentWatermark: true },
  }
  policies.set(id, enforced)
  const index = files.findIndex((item) => item.id === id)
  if (index !== -1) {
    files[index] = { ...files[index], protectionStatus: 'protected' }
  }
  return enforced
}

/** CSV mirror of the file-list payload, honouring the same filters. */
export async function mockExportFiles(filters: MockFileFilters = {}): Promise<Blob> {
  await delay(360)
  const page = await mockListFiles({ ...filters, page: 1, pageSize: 1000 })
  const rows: string[][] = [
    [
      'Name',
      'Format',
      'MIME type',
      'Size (bytes)',
      'Uploaded at',
      'Status',
      'Encryption',
      'Recipients',
      'Active links',
      'Expires at',
      'Checksum',
      'Tags',
      'Successful views',
      'Failed attempts',
    ],
  ]
  for (const file of page.results) {
    rows.push([
      file.name,
      file.extension,
      file.mimeType,
      String(file.sizeBytes),
      file.uploadedAt,
      file.protectionStatus,
      file.encryption,
      String(file.authorizedRecipients),
      String(file.activeShareLinks),
      file.expiresAt ?? '',
      file.checksum ?? '',
      (file.tags ?? []).join(', '),
      String(file.successfulViews ?? 0),
      String(file.failedAttempts ?? 0),
    ])
  }
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  return new Blob([csv], { type: 'text/csv;charset=utf-8' })
}

/* ------------------------------------------------------------------ *
 * Sharing — single-use links
 * ------------------------------------------------------------------ */
export async function mockListShares(params: MockShareFilters = {}): Promise<Paginated<ShareLink>> {
  await delay()
  const filtered = sortByDate(shares, 'createdAt').filter((share) => {
    const matchesSearch = matches(`${share.fileName} ${share.recipientUsername}`, params.search)
    const matchesState = !params.state || params.state === 'all' || share.state === params.state
    const matchesFile = !params.fileId || share.fileId === params.fileId
    return matchesSearch && matchesState && matchesFile
  })
  return paginate(filtered, params.page, params.pageSize ?? 8)
}

export interface CreateShareRecipientInput {
  username: string
  password: string
  displayName?: string
  permissions: RecipientPermissions
}

export interface CreateShareInput {
  fileId?: string
  recipients: CreateShareRecipientInput[]
}

export async function mockCreateShares(
  input: CreateShareInput,
): Promise<{ shares: ShareLink[]; recipients: Recipient[]; shareUrl: string }> {
  await delay(700)
  const file = files.find((item) => item.id === input.fileId)
  if (!file) throw new Error(`File ${input.fileId} not found`)

  const created: ShareLink[] = []
  const createdRecipients: Recipient[] = []
  const now = new Date().toISOString()

  input.recipients.forEach((entry, index) => {
    const token = makeHex(22)
    const recipient: Recipient = {
      id: `rcp_${makeHex(6)}`,
      username: entry.username,
      displayName: entry.displayName,
      fileId: file.id,
      fileName: file.name,
      permissions: entry.permissions,
      status: 'ACTIVE',
      createdAt: now,
      lastAuthenticatedAt: null,
    }
    const share: ShareLink = {
      id: `shr_${makeHex(6)}_${index}`,
      fileId: file.id,
      fileName: file.name,
      fileKind: file.kind,
      recipientId: recipient.id,
      recipientUsername: recipient.username,
      permissions: entry.permissions,
      tokenPreview: `••••••${token.slice(-6)}`,
      url: `${file.id}/${token}`,
      state: 'ACTIVE',
      createdAt: now,
      expiresAt: entry.permissions.expiresAt ?? file.expiresAt ?? null,
      consumedAt: null,
      consumedIp: null,
      sessionId: null,
      sessionStartedAt: null,
      sessionExpiresAt: null,
      successfulViews: 0,
      failedAttempts: 0,
      lastAccessedAt: null,
    }
    created.push(share)
    createdRecipients.push(recipient)
  })

  shares.unshift(...created)
  recipients.push(...createdRecipients)

  const index = files.findIndex((item) => item.id === file.id)
  if (index !== -1) {
    files[index] = {
      ...files[index],
      protectionStatus: 'protected',
      authorizedRecipients: files[index].authorizedRecipients + created.length,
      activeShareLinks: files[index].activeShareLinks + created.length,
    }
  }

  return {
    shares: created,
    recipients: createdRecipients,
    shareUrl: created[0]?.url ?? file.id,
  }
}

/** Issue a replacement link after consumption while keeping the credentials. */
export async function mockReissueShare(id: string): Promise<ShareLink> {
  await delay(300)
  const share = shares.find((item) => item.id === id)
  if (!share) throw new Error(`Share ${id} not found`)
  const token = makeHex(22)
  share.state = 'ACTIVE'
  share.tokenPreview = `••••••${token.slice(-6)}`
  share.url = `${share.fileId}/${token}`
  share.createdAt = new Date().toISOString()
  share.consumedAt = null
  share.consumedIp = null
  share.sessionId = null
  share.sessionStartedAt = null
  share.sessionExpiresAt = null
  share.successfulViews = 0
  share.lastAccessedAt = null
  const recipient = recipients.find((item) => item.id === share.recipientId)
  if (recipient) {
    recipient.status = 'ACTIVE'
    recipient.lastAuthenticatedAt = null
  }
  return share
}

export async function mockRevokeShare(id: string): Promise<ShareLink> {
  await delay(260)
  const share = shares.find((item) => item.id === id)
  if (!share) throw new Error(`Share ${id} not found`)
  share.state = 'REVOKED'
  share.sessionId = null
  share.sessionExpiresAt = null
  const recipient = recipients.find((item) => item.id === share.recipientId)
  if (recipient) recipient.status = 'REVOKED'
  return share
}

/** Remove a recipient along with their links and sessions. */
export async function mockRemoveRecipient(id: string): Promise<void> {
  await delay(240)
  const index = recipients.findIndex((item) => item.id === id)
  if (index === -1) throw new Error(`Recipient ${id} not found`)
  recipients.splice(index, 1)
  for (let i = shares.length - 1; i >= 0; i -= 1) {
    if (shares[i].recipientId === id) shares.splice(i, 1)
  }
}

/** Adjust the recipient-scoped tunables; fixed rules stay untouched. */
export async function mockUpdateSharePermissions(
  id: string,
  permissions: Partial<RecipientPermissions>,
): Promise<ShareLink> {
  await delay(280)
  const share = shares.find((item) => item.id === id)
  if (!share) throw new Error(`Share ${id} not found`)
  share.permissions = { ...share.permissions, ...permissions }
  if (permissions.expiresAt !== undefined) share.expiresAt = permissions.expiresAt
  const recipient = recipients.find((item) => item.id === share.recipientId)
  if (recipient) recipient.permissions = { ...recipient.permissions, ...permissions }
  return share
}

/* ------------------------------------------------------------------ *
 * Access monitoring
 * ------------------------------------------------------------------ */
export async function mockListAccessLogs(filters: AccessLogFilters = {}): Promise<Paginated<AccessLog>> {
  await delay()
  const filtered = sortByDate(accessLogs, 'occurredAt').filter((log) => {
    const matchesSearch = matches(
      `${log.recipientUsername} ${log.fileName} ${log.ip} ${log.device}`,
      filters.search,
    )
    const matchesResult =
      !filters.result || filters.result === 'all' || log.result === filters.result
    const matchesEvent =
      !filters.eventType || filters.eventType === 'all' || log.eventType === filters.eventType
    const matchesFile = !filters.fileId || log.fileId === filters.fileId
    const matchesRecipient =
      !filters.recipientUsername || log.recipientUsername === filters.recipientUsername
    const matchesFrom = !filters.dateFrom || log.occurredAt >= filters.dateFrom
    const matchesTo = !filters.dateTo || log.occurredAt <= filters.dateTo
    return (
      matchesSearch &&
      matchesResult &&
      matchesEvent &&
      matchesFile &&
      matchesRecipient &&
      matchesFrom &&
      matchesTo
    )
  })
  return paginate(filtered, filters.page, filters.pageSize ?? 12)
}

export async function mockGetDashboard(): Promise<DashboardSummary> {
  await delay(320)
  return {
    ...MOCK_DASHBOARD,
    metrics: {
      ...MOCK_DASHBOARD.metrics,
      totalProtectedFiles: files.filter((file) => file.protectionStatus === 'protected').length,
      activeShareLinks: shares.filter((share) => share.state === 'ACTIVE').length,
      activeSessions: shares.filter((share) => share.state === 'CONSUMED').length,
      authorizedRecipients: recipients.length,
    },
  }
}

export async function mockRecentAccess(limit = 8): Promise<AccessLog[]> {
  await delay(220)
  return sortByDate(accessLogs, 'occurredAt').slice(0, limit)
}

/* ------------------------------------------------------------------ *
 * Devices — traceability evidence
 * ------------------------------------------------------------------ */
export async function mockListDevices(filters: MockDeviceFilters = {}): Promise<Paginated<Device>> {
  await delay()
  const filtered = sortByDate(devices, 'lastActiveAt').filter((device) => {
    const matchesSearch = matches(
      `${device.label} ${device.ownerUsername} ${device.deviceIdentifier} ${device.os}`,
      filters.search,
    )
    const matchesTrust =
      !filters.trustStatus || filters.trustStatus === 'all' || device.trustStatus === filters.trustStatus
    const matchesOwner = !filters.ownerUsername || device.ownerUsername === filters.ownerUsername
    return matchesSearch && matchesTrust && matchesOwner
  })
  return paginate(filtered, filters.page, filters.pageSize ?? 8)
}

export async function mockSetDeviceTrust(id: string, trustStatus: Device['trustStatus']): Promise<Device> {
  await delay(220)
  const device = devices.find((item) => item.id === id)
  if (!device) throw new Error(`Device ${id} not found`)
  device.trustStatus = trustStatus
  return device
}

/** Correlate captured access events to a device by its label. */
export async function mockDeviceHistory(id: string): Promise<DeviceHistory> {
  await delay(340)
  const device = devices.find((item) => item.id === id)
  if (!device) throw new Error(`Device ${id} not found`)
  const events = sortByDate(accessLogs, 'occurredAt').filter((log) => log.device === device.label)
  return {
    deviceId: device.id,
    deviceIdentifier: device.deviceIdentifier,
    total: events.length,
    events,
  }
}

/* ------------------------------------------------------------------ *
 * Notifications
 * ------------------------------------------------------------------ */
export async function mockListNotifications(
  filters: MockNotificationFilters = {},
): Promise<Paginated<AppNotification>> {
  await delay()
  const filtered = sortByDate(notifications, 'createdAt').filter((notification) => {
    const matchesSearch = matches(`${notification.title} ${notification.message}`, filters.search)
    const matchesCategory =
      !filters.category || filters.category === 'all' || notification.category === filters.category
    const matchesUnread = !filters.unreadOnly || !notification.read
    return matchesSearch && matchesCategory && matchesUnread
  })
  return paginate(filtered, filters.page, filters.pageSize ?? 10)
}

export async function mockMarkNotificationRead(id: string): Promise<AppNotification> {
  await delay(120)
  const notification = notifications.find((item) => item.id === id)
  if (!notification) throw new Error(`Notification ${id} not found`)
  notification.read = true
  return notification
}

export async function mockMarkAllNotificationsRead(): Promise<void> {
  await delay(200)
  notifications.forEach((notification) => {
    notification.read = true
  })
}

export async function mockUnreadCount(): Promise<number> {
  await delay(90)
  return notifications.filter((notification) => !notification.read).length
}

export async function mockGetNotificationPreferences(): Promise<NotificationPreference[]> {
  await delay(200)
  if (notificationPreferences.length === 0) {
    notificationPreferences = (
      [
        'successful-access',
        'unauthorized-access',
        'new-device',
        'link-consumed',
        'link-forwarded',
        'file-expiration',
        'access-revoked',
      ] as const
    ).map((category) => ({
      category,
      email: category !== 'successful-access',
      inApp: true,
      digest: category === 'successful-access' ? 'daily' : 'instant',
    }))
  }
  return notificationPreferences
}

export async function mockUpdateNotificationPreferences(
  preferences: NotificationPreference[],
): Promise<NotificationPreference[]> {
  await delay(220)
  notificationPreferences = preferences
  return notificationPreferences
}

/* ------------------------------------------------------------------ *
 * Watermark records
 * ------------------------------------------------------------------ */
export async function mockListWatermarks(
  filters: MockWatermarkFilters = {},
): Promise<Paginated<WatermarkRecord>> {
  await delay()
  const filtered = sortByDate(watermarks, 'generatedAt').filter((record) => {
    const matchesSearch = matches(
      `${record.fileName} ${record.recipientUsername} ${record.accessId}`,
      filters.search,
    )
    const matchesFile = !filters.fileId || record.fileId === filters.fileId
    const matchesRecipient =
      !filters.recipientUsername || record.recipientUsername === filters.recipientUsername
    return matchesSearch && matchesFile && matchesRecipient
  })
  return paginate(filtered, filters.page, filters.pageSize ?? 8)
}

export async function mockGetWatermark(id: string): Promise<WatermarkRecord> {
  await delay(180)
  const record = watermarks.find((item) => item.id === id)
  if (!record) throw new Error(`Watermark ${id} not found`)
  return record
}

export async function mockVerifyWatermark(id: string): Promise<WatermarkRecord> {
  await delay(520)
  const record = watermarks.find((item) => item.id === id)
  if (!record) throw new Error(`Watermark ${id} not found`)
  record.verificationStatus = 'verified'
  return record
}

export async function mockLookupWatermark(input: {
  outputHash?: string
  accessId?: string
}): Promise<WatermarkLookupResult> {
  await delay(560)
  const hash = input.outputHash?.trim()
  const accessReference = input.accessId?.trim()

  if (!hash && !accessReference) {
    return {
      record: null,
      hashMatches: false,
      extractedLines: [],
      summary:
        'Provide a SHA-256 output hash or an access ID to compare against the stored watermark records.',
    }
  }

  const record =
    watermarks.find(
      (item) =>
        (hash && item.outputHash === hash) || (accessReference && item.accessId === accessReference),
    ) ?? null

  if (!record) {
    return {
      record: null,
      hashMatches: false,
      extractedLines: [],
      summary:
        'No stored record matches that hash or access ID. The image may be an unwatermarked copy, ' +
        'or the watermark may have been removed or reconstructed — in that case SecureFile cannot ' +
        'attribute the leak.',
    }
  }

  const hashMatches = Boolean(hash) && hash === record.outputHash
  return {
    record,
    hashMatches,
    extractedLines: [
      `${record.recipientUsername} | ${watermarkStampOf(new Date(record.generatedAt))}`,
      record.accessId,
    ],
    summary: hashMatches
      ? `Byte-exact match. This rendition was generated for “${record.recipientUsername}” and is bound to access ID ${record.accessId}.`
      : `Matched on access ID ${record.accessId}. Confirm the extracted watermark lines against the stored record before attributing the leak.`,
  }
}

/* ------------------------------------------------------------------ *
 * Public recipient viewer — single-use link
 * ------------------------------------------------------------------ */
function tokenFlags(token: string) {
  const value = token.toLowerCase()
  return {
    expired: value.includes('expired'),
    revoked: value.includes('revoked'),
    consumed: value.includes('consumed'),
    invalid: value.includes('invalid'),
    denied: value.includes('denied'),
  }
}

const demoRecipient = recipients.find((item) => item.status === 'ACTIVE')

/** Resolve the file a mock viewer link points at. With no fixtures there is none. */
function demoViewerFile(): SecureFile {
  const file = files.find((item) => item.id === demoRecipient?.fileId) ?? files[0]
  if (!file) {
    throw { status: 404, code: 'invalid_link', message: 'This access link is not valid.' }
  }
  return file
}

function demoLinkContext(token: string): ViewerLinkContext {
  const flags = tokenFlags(token)
  const file = demoViewerFile()
  const state: ViewerLinkContext['state'] = flags.invalid
    ? 'INVALID'
    : flags.revoked
      ? 'REVOKED'
      : flags.expired
        ? 'EXPIRED'
        : flags.consumed || consumedTokens.has(token)
          ? 'CONSUMED'
          : 'ACTIVE'
  return {
    fileId: file.id,
    fileName: file.name,
    fileKind: file.kind,
    extension: file.extension,
    ownerName: MOCK_USER.fullName,
    organization: MOCK_USER.organization,
    state,
    expiresAt: state === 'EXPIRED' ? new Date(Date.now() - 86_400_000).toISOString() : daysFromNow(14),
  }
}

export async function mockResolveViewerToken(token: string): Promise<ViewerLinkContext> {
  await delay(520)
  return demoLinkContext(token)
}

function buildViewerSession(token: string, username: string): ViewerSession {
  const file = demoViewerFile()
  const accessReference = makeAccessId()
  const issuedAt = new Date()
  const watermarkLines = [
    `${username} | ${watermarkStampOf(issuedAt)}`,
    `SecureFile · ${accessReference}`,
  ]
  const session: ViewerSession = {
    sessionId: `vs_${makeHex(10)}`,
    fileId: file.id,
    fileName: file.name,
    fileKind: file.kind,
    extension: file.extension,
    contentUrl: buildRenditionPreview({
      title: file.name,
      subtitle: 'Recipient-scoped rendition · watermarked by SecureFile',
      watermarkLines,
      opacity: 0.18,
      size: 1,
    }),
    recipientUsername: username,
    accessId: accessReference,
    watermarkLines,
    startedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + 30 * 60_000).toISOString(),
    remainingSeconds: 30 * 60,
  }
  consumedTokens.set(token, session)
  viewerSessions.set(session.sessionId, session)
  return session
}

/**
 * The only operation that consumes the link. Failed authentication leaves the
 * link ACTIVE; a successful authentication is atomic and single-use.
 */
export async function mockAuthenticateViewer(
  token: string,
  username: string,
  password: string,
): Promise<ViewerSession> {
  await delay(720)
  const flags = tokenFlags(token)
  if (flags.invalid) throw { status: 404, code: 'invalid_link', message: 'This access link is not valid.' }
  if (flags.revoked) {
    throw { status: 403, code: 'link_revoked', message: 'This access link has been revoked.' }
  }
  if (flags.expired) {
    throw { status: 410, code: 'link_expired', message: 'This access link has expired.' }
  }
  if (consumedTokens.has(token)) {
    throw {
      status: 409,
      code: 'link_consumed',
      message: 'This single-use link has already been consumed. Ask the sender for a replacement link.',
    }
  }
  if (!username.trim() || password.length < 8 || flags.denied) {
    throw {
      status: 401,
      code: 'invalid_credentials',
      message: 'The username or password is incorrect.',
    }
  }
  return buildViewerSession(token, username.trim())
}

/** Resume an already-authorized session from the browser session cookie. */
export async function mockGetViewerSession(token: string): Promise<ViewerSession> {
  await delay(320)
  const session = consumedTokens.get(token)
  if (!session) {
    throw {
      status: 409,
      code: 'session_required',
      message: 'No authorized session exists for this link yet.',
    }
  }
  const remaining = Math.max(
    0,
    Math.round((new Date(session.expiresAt).getTime() - Date.now()) / 1000),
  )
  if (remaining === 0) {
    throw { status: 401, code: 'session_expired', message: 'Your viewing session has ended.' }
  }
  session.remainingSeconds = remaining
  return session
}

export async function mockViewerHeartbeat(sessionId: string): Promise<{ remainingSeconds: number }> {
  const session = viewerSessions.get(sessionId)
  if (!session) throw new Error('Session not found')
  const remaining = Math.max(
    0,
    Math.round((new Date(session.expiresAt).getTime() - Date.now()) / 1000),
  )
  session.remainingSeconds = remaining
  if (remaining === 0) throw new Error('SESSION_EXPIRED')
  return { remainingSeconds: remaining }
}

export async function mockLogViewerEvent(): Promise<void> {
  await delay(80)
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString()
}
