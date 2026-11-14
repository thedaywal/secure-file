import { loadMock, request, withMockFallback } from '@/services/api'
import type { AccessLog, AccessLogFilters, BlockedIP, Paginated } from '@/types'

/** Count of rows removed by a bulk delete. */
export interface DeletedCount {
  deleted: number
}

export interface BlockIPInput {
  address: string
  reason?: string
}

/**
 * Access monitoring. Every successful and unsuccessful access attempt is
 * recorded server-side; this module reads, renders and (for the administrator)
 * prunes those records, and manages the public-address blocklist.
 */
export const accessService = {
  list(filters: AccessLogFilters = {}): Promise<Paginated<AccessLog>> {
    return withMockFallback(
      () =>
        request<Paginated<AccessLog>>({
          url: '/access-logs/',
          method: 'GET',
          params: {
            page: filters.page,
            page_size: filters.pageSize,
            search: filters.search,
            result: filters.result,
            event_type: filters.eventType,
            file_id: filters.fileId,
            recipient_username: filters.recipientUsername,
            date_from: filters.dateFrom,
            date_to: filters.dateTo,
            ordering: filters.ordering,
          },
        }),
      async () => (await loadMock()).mockListAccessLogs(filters),
    )
  },

  recent(limit = 8): Promise<AccessLog[]> {
    return withMockFallback(
      () => request<AccessLog[]>({ url: '/access-logs/recent/', method: 'GET', params: { limit } }),
      async () => (await loadMock()).mockRecentAccess(limit),
    )
  },

  forFile(fileId: string, filters: AccessLogFilters = {}): Promise<Paginated<AccessLog>> {
    return this.list({ ...filters, fileId })
  },

  forRecipient(
    recipientUsername: string,
    filters: AccessLogFilters = {},
  ): Promise<Paginated<AccessLog>> {
    return this.list({ ...filters, recipientUsername })
  },

  /** Deletes every event matching the current filters — exactly what is shown. */
  clear(filters: AccessLogFilters = {}): Promise<DeletedCount> {
    return withMockFallback(
      () =>
        request<DeletedCount>({
          url: '/access-logs/',
          method: 'DELETE',
          params: {
            search: filters.search,
            result: filters.result,
            event_type: filters.eventType,
            file_id: filters.fileId,
            recipient_username: filters.recipientUsername,
            date_from: filters.dateFrom,
            date_to: filters.dateTo,
          },
        }),
      async () => (await loadMock()).mockClearAccessLogs(filters),
    )
  },

  /** Removes a single recorded event. */
  remove(id: string): Promise<void> {
    return withMockFallback(
      () => request<void>({ url: `/access-logs/${id}/`, method: 'DELETE' }),
      async () => (await loadMock()).mockDeleteAccessLog(id),
    )
  },

  listBlocked(search?: string): Promise<BlockedIP[]> {
    return withMockFallback(
      () =>
        request<BlockedIP[]>({
          url: '/blocked-ips/',
          method: 'GET',
          params: { search: search || undefined },
        }),
      async () => (await loadMock()).mockListBlockedIPs(search),
    )
  },

  blockIP(input: BlockIPInput): Promise<BlockedIP> {
    return withMockFallback(
      () => request<BlockedIP>({ url: '/blocked-ips/', method: 'POST', data: input }),
      async () => (await loadMock()).mockBlockIP(input),
    )
  },

  unblockIP(id: string): Promise<void> {
    return withMockFallback(
      () => request<void>({ url: `/blocked-ips/${id}/`, method: 'DELETE' }),
      async () => (await loadMock()).mockUnblockIP(id),
    )
  },
}
