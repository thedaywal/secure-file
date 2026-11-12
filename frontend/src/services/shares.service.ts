import { request, withMockFallback } from '@/services/api'
import * as mock from '@/services/mock'
import type { CreateShareInput } from '@/services/mock'
import type {
  LinkState,
  Paginated,
  PaginationParams,
  Recipient,
  RecipientPermissions,
  ShareLink,
} from '@/types'

export interface ShareFilters extends PaginationParams {
  state?: LinkState | 'all'
  fileId?: string
}

export interface ShareCreationResult {
  shares: ShareLink[]
  recipients: Recipient[]
  shareUrl: string
}

export const sharesService = {
  list(filters: ShareFilters = {}): Promise<Paginated<ShareLink>> {
    return withMockFallback(
      () =>
        request<Paginated<ShareLink>>({
          url: '/shares/',
          method: 'GET',
          params: {
            page: filters.page,
            page_size: filters.pageSize,
            search: filters.search,
            state: filters.state,
            file_id: filters.fileId,
          },
        }),
      () => mock.mockListShares(filters),
    )
  },

  get(id: string): Promise<ShareLink> {
    return withMockFallback(
      () => request<ShareLink>({ url: `/shares/${id}/`, method: 'GET' }),
      async () => {
        const page = await mock.mockListShares({ pageSize: 200 })
        const share = page.results.find((item) => item.id === id)
        if (!share) throw { status: 404, code: 'not_found', message: 'Access link not found.' }
        return share
      },
    )
  },

  /**
   * Issue single-use access links for a protected image. Each recipient gets
   * image-specific credentials and its own unique, unguessable token. The
   * backend stores only the token hash and returns the plaintext link once.
   */
  createForFile(fileId: string, input: CreateShareInput): Promise<ShareCreationResult> {
    return withMockFallback(
      () =>
        request<ShareCreationResult>({
          url: `/files/${fileId}/share/`,
          method: 'POST',
          data: {
            recipients: input.recipients.map((recipient) => ({
              username: recipient.username,
              password: recipient.password,
              display_name: recipient.displayName,
              permissions: recipient.permissions,
            })),
          },
        }),
      () => mock.mockCreateShares({ ...input, fileId }),
    )
  },

  /**
   * Issue a replacement link for a recipient whose link was consumed or lost.
   * The previous token is invalidated; credentials are unchanged.
   */
  reissue(id: string): Promise<ShareLink> {
    return withMockFallback(
      () => request<ShareLink>({ url: `/shares/${id}/reissue/`, method: 'POST' }),
      () => mock.mockReissueShare(id),
    )
  },

  revoke(id: string): Promise<ShareLink> {
    return withMockFallback(
      () => request<ShareLink>({ url: `/shares/${id}/revoke/`, method: 'POST' }),
      () => mock.mockRevokeShare(id),
    )
  },

  /**
   * Remove a recipient and their access entirely. Their links and viewing
   * sessions are deleted; access logs and watermark records are retained.
   */
  removeRecipient(recipientId: string): Promise<void> {
    return withMockFallback(
      () => request<void>({ url: `/recipients/${recipientId}/`, method: 'DELETE' }),
      () => mock.mockRemoveRecipient(recipientId),
    )
  },

  /**
   * Adjust the recipient-scoped tunables on a share. The fixed access rules
   * (view-only, single-use link, single session) cannot be changed here.
   */
  updatePermissions(id: string, permissions: Partial<RecipientPermissions>): Promise<ShareLink> {
    return withMockFallback(
      () =>
        request<ShareLink>({
          url: `/shares/${id}/permissions/`,
          method: 'PATCH',
          data: permissions,
        }),
      () => mock.mockUpdateSharePermissions(id, permissions),
    )
  },
}
