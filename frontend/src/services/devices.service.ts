import { request, withMockFallback } from '@/services/api'
import * as mock from '@/services/mock'
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
      () => mock.mockListDevices(filters),
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
      () => mock.mockSetDeviceTrust(id, trustStatus),
    )
  },

  /** Correlated capture timeline for one device (audit evidence, newest first). */
  history(id: string): Promise<DeviceHistory> {
    return withMockFallback(
      () => request<DeviceHistory>({ url: `/devices/${id}/history/`, method: 'GET' }),
      () => mock.mockDeviceHistory(id),
    )
  },
}
