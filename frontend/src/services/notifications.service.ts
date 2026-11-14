import { loadMock, request, withMockFallback } from '@/services/api'
import type {
  AppNotification,
  NotificationPreference,
  Paginated,
  PaginationParams,
} from '@/types'

export interface NotificationFilters extends PaginationParams {
  category?: string
  unreadOnly?: boolean
}

export const notificationsService = {
  list(filters: NotificationFilters = {}): Promise<Paginated<AppNotification>> {
    return withMockFallback(
      () =>
        request<Paginated<AppNotification>>({
          url: '/notifications/',
          method: 'GET',
          params: {
            page: filters.page,
            page_size: filters.pageSize,
            search: filters.search,
            category: filters.category,
            unread_only: filters.unreadOnly,
          },
        }),
      async () => (await loadMock()).mockListNotifications(filters),
    )
  },

  unreadCount(): Promise<number> {
    return withMockFallback(
      async () => {
        const page = await request<Paginated<AppNotification>>({
          url: '/notifications/',
          method: 'GET',
          params: { unread_only: true, page_size: 1 },
        })
        return page.count
      },
      async () => (await loadMock()).mockUnreadCount(),
    )
  },

  markRead(id: string): Promise<AppNotification> {
    return withMockFallback(
      () => request<AppNotification>({ url: `/notifications/${id}/read/`, method: 'POST' }),
      async () => (await loadMock()).mockMarkNotificationRead(id),
    )
  },

  remove(id: string): Promise<void> {
    return withMockFallback(
      () => request<void>({ url: `/notifications/${id}/`, method: 'DELETE' }),
      async () => (await loadMock()).mockDeleteNotification(id),
    )
  },

  /** Deletes every notification matching the current filters. */
  removeAll(filters: NotificationFilters = {}): Promise<{ deleted: number }> {
    return withMockFallback(
      () =>
        request<{ deleted: number }>({
          url: '/notifications/',
          method: 'DELETE',
          params: {
            search: filters.search,
            category: filters.category,
            unread_only: filters.unreadOnly,
          },
        }),
      async () => (await loadMock()).mockDeleteAllNotifications(filters),
    )
  },

  markAllRead(): Promise<void> {
    return withMockFallback(
      () => request<void>({ url: '/notifications/read-all/', method: 'POST' }),
      async () => (await loadMock()).mockMarkAllNotificationsRead(),
    )
  },

  getPreferences(): Promise<NotificationPreference[]> {
    return withMockFallback(
      () => request<NotificationPreference[]>({ url: '/notifications/preferences/', method: 'GET' }),
      async () => (await loadMock()).mockGetNotificationPreferences(),
    )
  },

  updatePreferences(preferences: NotificationPreference[]): Promise<NotificationPreference[]> {
    return withMockFallback(
      () =>
        request<NotificationPreference[]>({
          url: '/notifications/preferences/',
          method: 'PUT',
          data: { preferences },
        }),
      async () => (await loadMock()).mockUpdateNotificationPreferences(preferences),
    )
  },
}
