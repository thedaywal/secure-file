/** Formatting helpers shared across the application. */

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value.toFixed(exponent === 0 ? 0 : fractionDigits)} ${BYTE_UNITS[exponent]}`
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  )
}

function toDate(input: string | number | Date | null | undefined): Date | null {
  if (input === null || input === undefined || input === '') return null
  const date = input instanceof Date ? input : new Date(input)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(input: string | number | Date | null | undefined): string {
  const date = toDate(input)
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date)
}

export function formatDateTime(input: string | number | Date | null | undefined): string {
  const date = toDate(input)
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    // `hourCycle` rather than `hour12: false`: the latter resolves to h24 in some
    // engines, which renders midnight as "24:00" instead of "00:00".
    hourCycle: 'h23',
  }).format(date)
}

export function formatTime(input: string | number | Date | null | undefined): string {
  const date = toDate(input)
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

export function formatShortDate(input: string | number | Date | null | undefined): string {
  const date = toDate(input)
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 1000 * 60 * 60 * 24 * 365],
  ['month', 1000 * 60 * 60 * 24 * 30],
  ['week', 1000 * 60 * 60 * 24 * 7],
  ['day', 1000 * 60 * 60 * 24],
  ['hour', 1000 * 60 * 60],
  ['minute', 1000 * 60],
  ['second', 1000],
]

export function formatRelativeTime(input: string | number | Date | null | undefined): string {
  const date = toDate(input)
  if (!date) return '—'
  const formatter = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' })
  const diff = date.getTime() - Date.now()

  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(diff) >= ms || unit === 'second') {
      return formatter.format(Math.round(diff / ms), unit)
    }
  }
  return 'just now'
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export function formatUntil(input: string | number | Date | null | undefined): string {
  const date = toDate(input)
  if (!date) return 'No expiration'
  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000)
  if (diffSeconds <= 0) return 'Expired'
  const days = Math.floor(diffSeconds / 86400)
  if (days >= 1) return `in ${days} day${days === 1 ? '' : 's'}`
  const hours = Math.floor(diffSeconds / 3600)
  if (hours >= 1) return `in ${hours} hour${hours === 1 ? '' : 's'}`
  const minutes = Math.max(1, Math.floor(diffSeconds / 60))
  return `in ${minutes} min`
}

export function isExpired(input: string | number | Date | null | undefined): boolean {
  const date = toDate(input)
  if (!date) return false
  return date.getTime() <= Date.now()
}

/** jane.doe@example.com -> j•••@example.com */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return email
  const visible = local.slice(0, 1)
  return `${visible}${'•'.repeat(Math.max(2, Math.min(local.length - 1, 5)))}@${domain}`
}

/** Keeps the last `visible` characters of a token and masks the rest. */
export function maskToken(token: string, visible = 6): string {
  if (token.length <= visible) return token
  return `••••••${token.slice(-visible)}`
}

/** 9f2c4a...b71e */
export function truncateHash(hash: string, edge = 8): string {
  if (hash.length <= edge * 2 + 3) return hash
  return `${hash.slice(0, edge)}…${hash.slice(-edge + 3)}`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((part) => part.charAt(0).toUpperCase()).join('') || '?'
}

export function percent(value: number, total: number): number {
  if (!total) return 0
  return Math.round((value / total) * 100)
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/**
 * SecureFile only accepts images, so every supported extension maps to the
 * single `image` kind.
 */
export function fileKindOf(_extension: string): 'image' {
  return 'image'
}

export function mimeTypeOf(extension: string): string {
  switch (extension.toUpperCase()) {
    case 'PNG':
      return 'image/png'
    case 'WEBP':
      return 'image/webp'
    case 'JPG':
    case 'JPEG':
      return 'image/jpeg'
    default:
      return 'image/jpeg'
  }
}

/** Converts a Date to a value accepted by <input type="datetime-local">. */
export function toDateTimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
