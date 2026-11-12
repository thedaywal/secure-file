import { request, withMockFallback } from '@/services/api'
import * as mock from '@/services/mock'
import type { DashboardSummary } from '@/types'

/**
 * Aggregated analytics for the main dashboard.
 * Proposed endpoint: GET /api/dashboard/summary/
 */
export const dashboardService = {
  summary(): Promise<DashboardSummary> {
    return withMockFallback(
      () => request<DashboardSummary>({ url: '/dashboard/summary/', method: 'GET' }),
      () => mock.mockGetDashboard(),
    )
  },
}
