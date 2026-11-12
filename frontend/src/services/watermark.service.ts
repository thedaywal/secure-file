import { request, withMockFallback } from '@/services/api'
import * as mock from '@/services/mock'
import type { Paginated, PaginationParams, WatermarkLookupResult, WatermarkRecord } from '@/types'

export interface WatermarkFilters extends PaginationParams {
  fileId?: string
  recipientUsername?: string
}

/**
 * Watermark records describe the recipient-scoped renditions the backend
 * produced. Every rendition embeds a repeated diagonal watermark containing the
 * authenticated username and the server access timestamp directly in the image
 * pixels; the UI only surfaces the audit metadata and a preview.
 */
export const watermarkService = {
  list(filters: WatermarkFilters = {}): Promise<Paginated<WatermarkRecord>> {
    return withMockFallback(
      () =>
        request<Paginated<WatermarkRecord>>({
          url: '/watermarks/',
          method: 'GET',
          params: {
            page: filters.page,
            page_size: filters.pageSize,
            search: filters.search,
            file_id: filters.fileId,
            recipient_username: filters.recipientUsername,
          },
        }),
      () => mock.mockListWatermarks(filters) as Promise<Paginated<WatermarkRecord>>,
    )
  },

  get(id: string): Promise<WatermarkRecord> {
    return withMockFallback(
      () => request<WatermarkRecord>({ url: `/watermarks/${id}/`, method: 'GET' }),
      () => mock.mockGetWatermark(id) as Promise<WatermarkRecord>,
    )
  },

  /** Recompute the output hash and confirm the rendition integrity. */
  verify(id: string): Promise<WatermarkRecord> {
    return withMockFallback(
      () => request<WatermarkRecord>({ url: `/watermarks/${id}/verify/`, method: 'POST' }),
      () => mock.mockVerifyWatermark(id) as Promise<WatermarkRecord>,
    )
  },

  /**
   * Investigation surface: compare an extracted watermark (or a leaked image
   * hash) against stored records to attribute a suspected leak. The result
   * never over-claims — a removed or reconstructed mark cannot be attributed.
   */
  lookup(input: { outputHash?: string; accessId?: string }): Promise<WatermarkLookupResult> {
    return withMockFallback(
      () =>
        request<WatermarkLookupResult>({
          url: '/watermarks/lookup/',
          method: 'POST',
          data: { output_hash: input.outputHash, access_id: input.accessId },
        }),
      () => mock.mockLookupWatermark(input),
    )
  },
}
