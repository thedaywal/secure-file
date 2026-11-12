import type { SegmentedOption } from '@/components/common/SegmentedControl'
import type { AccessLog, AccessLogFilters } from '@/types'

/**
 * The seven monitored security signals plus an "all events" passthrough.
 *
 * Every key maps onto an access-log API parameter (see FILTER_API_MAP). The
 * backend is the source of truth: nothing here is an authorization boundary,
 * only a read-side narrowing of the audit log.
 */
export type MonitorFilterKey =
  | 'all'
  | 'success'
  | 'failed'
  | 'unauthorized-device'
  | 'forwarded-link'
  | 'expired-link'
  | 'link-consumed'
  | 'revoked-link'

const FILTER_KEYS: readonly MonitorFilterKey[] = [
  'all',
  'success',
  'failed',
  'unauthorized-device',
  'forwarded-link',
  'expired-link',
  'link-consumed',
  'revoked-link',
]

/** Options for the "Event filter" segmented control (includes "All events"). */
export const MONITOR_FILTER_OPTIONS: SegmentedOption<MonitorFilterKey>[] = [
  { value: 'all', label: 'All events' },
  { value: 'success', label: 'Successful' },
  { value: 'failed', label: 'Failed' },
  { value: 'unauthorized-device', label: 'Unauthorized device' },
  { value: 'forwarded-link', label: 'Forwarded link' },
  { value: 'expired-link', label: 'Expired link' },
  { value: 'link-consumed', label: 'Link consumed' },
  { value: 'revoked-link', label: 'Revoked link' },
]

export const MONITOR_FILTER_LABEL: Record<MonitorFilterKey, string> = {
  all: 'All events',
  success: 'Successful access',
  failed: 'Failed access',
  'unauthorized-device': 'Unauthorized device',
  'forwarded-link': 'Forwarded-link attempt',
  'expired-link': 'Expired-link attempt',
  'link-consumed': 'Link consumption',
  'revoked-link': 'Revoked-link attempt',
}

/**
 * Filter -> API parameter mapping.
 *  - successful / failed access narrow on `result`.
 *  - the five abuse signals narrow on the more specific `eventType`.
 */
const FILTER_API_MAP: Record<MonitorFilterKey, Pick<AccessLogFilters, 'result' | 'eventType'>> = {
  all: {},
  success: { result: 'success' },
  failed: { result: 'failed' },
  'unauthorized-device': { eventType: 'unauthorized-device' },
  'forwarded-link': { eventType: 'forwarded-link' },
  'expired-link': { eventType: 'expired-link' },
  'link-consumed': { eventType: 'link-consumed' },
  'revoked-link': { eventType: 'revoked-link' },
}

export interface MonitorFilterState {
  filter: MonitorFilterKey
  search: string
  dateFrom: string
  dateTo: string
}

export function isMonitorFilterKey(value: string | null): value is MonitorFilterKey {
  return value !== null && (FILTER_KEYS as readonly string[]).includes(value)
}

/** Builds the shared access-log filter object from the monitor filter state. */
export function buildAccessFilters(state: MonitorFilterState): AccessLogFilters {
  return {
    ...FILTER_API_MAP[state.filter],
    search: state.search.trim() || undefined,
    dateFrom: state.dateFrom || undefined,
    dateTo: state.dateTo || undefined,
  }
}

export interface AccessSummary {
  total: number
  successful: number
  failed: number
  highRisk: number
}

/**
 * Honest tally over a fetched page of logs. `total` prefers the server count
 * (which honours the filters) over the length of the fetched sample.
 */
export function summarizeAccess(logs: AccessLog[], total?: number): AccessSummary {
  return {
    total: total ?? logs.length,
    successful: logs.filter((log) => log.result === 'success').length,
    failed: logs.filter((log) => log.result === 'failed' || log.result === 'blocked').length,
    highRisk: logs.filter((log) => log.riskLevel === 'high' || log.riskLevel === 'critical').length,
  }
}
