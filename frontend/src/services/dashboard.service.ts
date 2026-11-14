import { loadMock, request, withMockFallback } from '@/services/api'
import type { DashboardSummary } from '@/types'

/**
 * Aggregated analytics for the main dashboard.
 * Proposed endpoint: GET /api/dashboard/summary/
 */
export const dashboardService = {
  summary(): Promise<DashboardSummary> {
    return withMockFallback(
      () => request<DashboardSummary>({ url: '/dashboard/summary/', method: 'GET' }),
      async () => (await loadMock()).mockGetDashboard(),
    )
  },
}
