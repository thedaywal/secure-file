import { loadMock, request, withMockFallback } from '@/services/api'
import type { Device, DeviceHistory, Paginated, PaginationParams } from '@/types'

export interface DeviceFilters extends PaginationParams {
  trustStatus?: string
  ownerUsername?: string
}

export const devicesService = {
  list(filters: DeviceFilters = {}): Promise<Paginated<Device>> {
    return withMockFallback(
      () =>
        request<Paginated<Device>>({
          url: '/devices/',
          method: 'GET',
          params: {
            page: filters.page,
            page_size: filters.pageSize,
            search: filters.search,
            trust_status: filters.trustStatus,
            owner_username: filters.ownerUsername,
          },
        }),
      async () => (await loadMock()).mockListDevices(filters),
    )
  },

  /** Update the trust flag on a captured device record (evidence annotation only). */
  setTrust(id: string, trustStatus: Device['trustStatus']): Promise<Device> {
    return withMockFallback(
      () =>
        request<Device>({
          url: `/devices/${id}/`,
          method: 'PATCH',
          data: { trust_status: trustStatus },
        }),
      async () => (await loadMock()).mockSetDeviceTrust(id, trustStatus),
    )
  },

  remove(id: string): Promise<void> {
    return withMockFallback(
      () => request<void>({ url: `/devices/${id}/`, method: 'DELETE' }),
      async () => (await loadMock()).mockDeleteDevice(id),
    )
  },

  /** Correlated capture timeline for one device (audit evidence, newest first). */
  history(id: string): Promise<DeviceHistory> {
    return withMockFallback(
      () => request<DeviceHistory>({ url: `/devices/${id}/history/`, method: 'GET' }),
      async () => (await loadMock()).mockDeviceHistory(id),
    )
  },
}
