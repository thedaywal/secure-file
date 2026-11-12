/**
 * Namespaced, failure-tolerant storage helpers.
 *
 * Only non-sensitive presentation state is persisted here. Authentication
 * tokens live in-memory by default (see AuthContext) so that a stolen
 * localStorage dump cannot be replayed against the API.
 */

const PREFIX = 'securefile'

function key(name: string): string {
  return `${PREFIX}:${name}`
}

export function readJson<T>(name: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key(name))
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeJson(name: string, value: unknown): void {
  try {
    window.localStorage.setItem(key(name), JSON.stringify(value))
  } catch {
    /* storage unavailable (private mode / quota) — ignore */
  }
}

export function readString(name: string, fallback = ''): string {
  try {
    return window.localStorage.getItem(key(name)) ?? fallback
  } catch {
    return fallback
  }
}

export function writeString(name: string, value: string): void {
  try {
    window.localStorage.setItem(key(name), value)
  } catch {
    /* ignore */
  }
}

export function removeKey(name: string): void {
  try {
    window.localStorage.removeItem(key(name))
  } catch {
    /* ignore */
  }
}
