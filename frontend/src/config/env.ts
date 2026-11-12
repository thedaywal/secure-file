/**
 * Runtime configuration sourced from Vite environment variables.
 * Credentials and encryption keys must never live in frontend source.
 */

function normaliseUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

const fallbackOrigin =
  typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'

export const env = {
  /** Django REST Framework base URL, e.g. http://localhost:8000/api */
  apiBaseUrl: normaliseUrl(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api'),

  /**
   * When true, service modules transparently fall back to bundled mock adapters
   * for endpoints that are not implemented on the backend yet.
   */
  enableMockFallback: (import.meta.env.VITE_ENABLE_MOCK_FALLBACK ?? 'true') !== 'false',

  apiTimeout: Number(import.meta.env.VITE_API_TIMEOUT ?? 20000),

  /** Public origin used to build recipient sharing links, e.g. https://example.com */
  shareBaseUrl: normaliseUrl(import.meta.env.VITE_SHARE_BASE_URL ?? fallbackOrigin),

  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
} as const

/**
 * Recipient links arrive from the API as a complete URL (`share.url`), which is
 * passed straight through. Only a bare token — the shape the mock adapters
 * produce — is wrapped with the configured share base.
 */
export function buildShareUrl(tokenOrUrl: string): string {
  if (/^https?:\/\//i.test(tokenOrUrl)) return tokenOrUrl
  return `${env.shareBaseUrl}/${encodeURIComponent(tokenOrUrl)}`
}
