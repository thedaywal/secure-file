import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios'

import { env } from '@/config/env'
import type { ApiError, ApiErrorPayload } from '@/types'

/* ------------------------------------------------------------------ *
 * Token plumbing
 *
 * The access token is held in memory and injected per request. It is never
 * read from or written to persistent storage, so a stolen storage dump cannot
 * be replayed against the Django API.
 * ------------------------------------------------------------------ */
let accessToken: string | null = null
let unauthorizedHandler: (() => void) | null = null

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

/** Registered by AuthContext so a 401 can force a clean sign-out. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler
}

/* ------------------------------------------------------------------ *
 * Axios client
 * ------------------------------------------------------------------ */
export const apiClient: AxiosInstance = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: env.apiTimeout,
  // The recipient viewer session is bound to the browser by an HttpOnly,
  // SameSite cookie; without this the cookie would never round-trip between the
  // SPA origin (5173) and the API origin (8000).
  withCredentials: true,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
})

apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.set('Authorization', `Bearer ${accessToken}`)
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      unauthorizedHandler?.()
    }
    return Promise.reject(error)
  },
)

/* ------------------------------------------------------------------ *
 * Error normalisation
 * ------------------------------------------------------------------ */
const SYSTEM_ERROR_KEYS = new Set(['detail', 'code', 'message', 'error'])

function extractFieldErrors(payload: unknown): Record<string, string[]> | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  const entries = Object.entries(payload as Record<string, unknown>).filter(
    ([key, value]) => !SYSTEM_ERROR_KEYS.has(key) && Array.isArray(value),
  )
  if (entries.length === 0) return undefined
  return Object.fromEntries(
    entries.map(([key, value]) => [key, (value as unknown[]).map((item) => String(item))]),
  )
}

function firstMessage(payload: unknown): string | undefined {
  if (typeof payload === 'string' && payload.trim()) return payload.trim()
  if (!payload || typeof payload !== 'object') return undefined
  const record = payload as ApiErrorPayload
  if (typeof record.detail === 'string') return record.detail
  if (typeof record.message === 'string') return record.message
  if (typeof record.error === 'string') return record.error
  const fieldErrors = extractFieldErrors(payload)
  if (fieldErrors) {
    const [, messages] = Object.entries(fieldErrors)[0] ?? []
    if (messages?.[0]) return messages[0]
  }
  return undefined
}

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    'message' in value &&
    typeof (value as ApiError).message === 'string'
  )
}

export function toApiError(error: unknown): ApiError {
  if (isApiError(error)) return error

  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<unknown>
    const status = axiosError.response?.status ?? 0
    const payload = axiosError.response?.data

    if (status === 0) {
      const timedOut = axiosError.code === 'ECONNABORTED'
      return {
        status: 0,
        code: timedOut ? 'timeout' : 'network_error',
        message: timedOut
          ? 'The request timed out. Check your connection and try again.'
          : 'Unable to reach the SecureFile API. Check your connection or API base URL.',
      }
    }

    const code =
      (payload && typeof payload === 'object' && 'code' in payload
        ? String((payload as ApiErrorPayload).code)
        : undefined) ?? `http_${status}`

    return {
      status,
      code,
      message:
        firstMessage(payload) ??
        axiosError.message ??
        `Request failed with status ${status}.`,
      fieldErrors: extractFieldErrors(payload),
    }
  }

  if (error instanceof Error) {
    return { status: 0, code: 'client_error', message: error.message }
  }

  return { status: 0, code: 'unknown_error', message: 'An unexpected error occurred.' }
}

/* ------------------------------------------------------------------ *
 * Request helper
 * ------------------------------------------------------------------ */
export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.request<T>(config)
  return response.data
}

/**
 * HTTP statuses that indicate the endpoint is not available yet rather than a
 * genuine application error. Only these trigger the mock fallback, so real
 * validation (400/422) and authorization (401/403) failures always surface.
 */
const FALLBACK_STATUSES = new Set([0, 404, 405, 501, 502, 503, 504])

/**
 * Loads the mock adapters on demand. The dynamic import keeps the (large) mock
 * bundle out of the production entry chunk and stops it being preloaded: with
 * `VITE_ENABLE_MOCK_FALLBACK=false` it is never fetched at all.
 */
export function loadMock(): Promise<typeof import('@/services/mock')> {
  return import('@/services/mock')
}

export function isMockFallbackEligible(error: unknown): boolean {
  if (!env.enableMockFallback) return false
  const apiError = toApiError(error)
  return FALLBACK_STATUSES.has(apiError.status)
}

/**
 * Attempt the live endpoint first; transparently fall back to the bundled mock
 * adapter when the backend route is not implemented yet. Mock services live in
 * `src/services/mock` and are clearly isolated from real API integration.
 */
export async function withMockFallback<T>(
  live: () => Promise<T>,
  mock: () => Promise<T>,
): Promise<T> {
  try {
    return await live()
  } catch (error) {
    if (isMockFallbackEligible(error)) {
      if (env.isDev) {
        console.info(
          '[SecureFile] Falling back to mock data —',
          toApiError(error).message,
        )
      }
      return mock()
    }
    throw toApiError(error)
  }
}

/* ------------------------------------------------------------------ *
 * Response guards — never trust the wire shape blindly.
 * ------------------------------------------------------------------ */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function assertRecord(value: unknown, context: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw {
      status: 0,
      code: 'invalid_response',
      message: `Unexpected response shape from ${context}.`,
    } satisfies ApiError
  }
  return value
}

export function pickString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

export function pickNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function pickArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}
