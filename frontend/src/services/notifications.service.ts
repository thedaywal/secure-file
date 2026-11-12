import { request, withMockFallback } from '@/services/api'
import * as mock from '@/services/mock'
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
      () => mock.mockListNotifications(filters),
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
      () => mock.mockUnreadCount(),
    )
  },

  markRead(id: string): Promise<AppNotification> {
    return withMockFallback(
      () => request<AppNotification>({ url: `/notifications/${id}/read/`, method: 'POST' }),
      () => mock.mockMarkNotificationRead(id),
    )
  },

  markAllRead(): Promise<void> {
    return withMockFallback(
      () => request<void>({ url: '/notifications/read-all/', method: 'POST' }),
      () => mock.mockMarkAllNotificationsRead(),
    )
  },

  getPreferences(): Promise<NotificationPreference[]> {
    return withMockFallback(
      () => request<NotificationPreference[]>({ url: '/notifications/preferences/', method: 'GET' }),
      () => mock.mockGetNotificationPreferences(),
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
      () => mock.mockUpdateNotificationPreferences(preferences),
    )
  },
}
