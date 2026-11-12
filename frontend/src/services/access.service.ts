import { request, withMockFallback } from '@/services/api'
import * as mock from '@/services/mock'
import type { AccessLog, AccessLogFilters, Paginated } from '@/types'

/**
 * Access monitoring. Every successful and unsuccessful access attempt is
 * recorded server-side; this module only reads and renders those records.
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
      () => mock.mockListAccessLogs(filters),
    )
  },

  recent(limit = 8): Promise<AccessLog[]> {
    return withMockFallback(
      () => request<AccessLog[]>({ url: '/access-logs/recent/', method: 'GET', params: { limit } }),
      () => mock.mockRecentAccess(limit),
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
}
