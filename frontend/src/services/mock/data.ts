/**
 * MOCK ONLY — fixtures for endpoints that are not implemented on the Django
 * backend yet. Swap `enableMockFallback` off once the real routes land; nothing
 * here is imported by production code paths other than through the explicit
 * fallback in `src/services/api.ts`.
 *
 * The demo dataset is deliberately empty: only the administrator identity is
 * kept so the mock adapters have a signed-in user to return. Everything else
 * starts from nothing — create records through the app instead of seeding fake
 * ones here.
 */

import type {
  AccessLog,
  AppNotification,
  DashboardSummary,
  Device,
  Recipient,
  SecureFile,
  ShareLink,
  User,
  WatermarkRecord,
} from '@/types'

const DAY = 86_400_000
const daysAgo = (days: number, jitterHours = 0): string =>
  new Date(Date.now() - days * DAY - jitterHours * 3_600_000).toISOString()

/* ------------------------------------------------------------------ *
 * Identity — single administrator, no registration
 * ------------------------------------------------------------------ */
export const MOCK_USER: User = {
  id: 'usr_01',
  email: 'admin@securefile.io',
  fullName: 'Alexandra Vance',
  role: 'admin',
  organization: 'Meridian Capital Group',
  jobTitle: 'Security Administrator',
  createdAt: daysAgo(412),
  lastLoginAt: daysAgo(0, 3),
}

/* ------------------------------------------------------------------ *
 * Empty datasets — no demo records are shipped. The mock adapters still
 * create/update in memory; they simply start from nothing.
 * ------------------------------------------------------------------ */
export const MOCK_FILES: SecureFile[] = []
export const MOCK_RECIPIENTS: Recipient[] = []
export const MOCK_SHARES: ShareLink[] = []
export const MOCK_DEVICES: Device[] = []
export const MOCK_ACCESS_LOGS: AccessLog[] = []
export const MOCK_NOTIFICATIONS: AppNotification[] = []
export const MOCK_WATERMARKS: WatermarkRecord[] = []

export const MOCK_DASHBOARD: DashboardSummary = {
  metrics: {
    totalProtectedFiles: 0,
    activeShareLinks: 0,
    authorizedRecipients: 0,
    successfulAccess: 0,
    failedAccess: 0,
    activeSessions: 0,
  },
  deltas: {},
  accessActivity: [],
  accessOutcome: [
    { name: 'Successful', value: 0, tone: 'success' },
    { name: 'Failed', value: 0, tone: 'failed' },
    { name: 'Blocked', value: 0, tone: 'blocked' },
  ],
  eventBreakdown: [],
  topFiles: [],
}

/* ------------------------------------------------------------------ *
 * Lookup helpers shared by mock adapters
 * ------------------------------------------------------------------ */
export const MOCK_INDEX = {
  file: (id: string) => MOCK_FILES.find((file) => file.id === id),
  recipient: (id: string) => MOCK_RECIPIENTS.find((recipient) => recipient.id === id),
  share: (id: string) => MOCK_SHARES.find((share) => share.id === id),
  device: (id: string) => MOCK_DEVICES.find((device) => device.id === id),
  watermark: (id: string) => MOCK_WATERMARKS.find((record) => record.id === id),
}

const HEX = '0123456789abcdef'

export function makeHex(length: number): string {
  let out = ''
  for (let index = 0; index < length; index += 1) out += HEX[Math.floor(Math.random() * 16)]
  return out
}

export function makeAccessId(): string {
  const block = () => Math.floor(Math.random() * 9000) + 1000
  return `SF-AC-${block()}-${block()}`
}

const MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
]

/** Matches the approved watermark stamp format: 09 NOV 2026 - 10:30 */
export function watermarkStampOf(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()} - ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}
