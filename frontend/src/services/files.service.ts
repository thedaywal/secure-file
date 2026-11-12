import { request, withMockFallback } from '@/services/api'
import * as mock from '@/services/mock'
import type {
  FilePolicy,
  FileUploadInput,
  Paginated,
  PaginationParams,
  SecureFile,
} from '@/types'

export interface FileFilters extends PaginationParams {
  status?: string
  kind?: string
}

export const filesService = {
  list(filters: FileFilters = {}): Promise<Paginated<SecureFile>> {
    return withMockFallback(
      () =>
        request<Paginated<SecureFile>>({
          url: '/files/',
          method: 'GET',
          params: {
            page: filters.page,
            page_size: filters.pageSize,
            search: filters.search,
            status: filters.status,
            kind: filters.kind,
            ordering: filters.ordering,
          },
        }),
      () => mock.mockListFiles(filters),
    )
  },

  get(id: string): Promise<SecureFile> {
    return withMockFallback(
      () => request<SecureFile>({ url: `/files/${id}/`, method: 'GET' }),
      () => mock.mockGetFile(id),
    )
  },

  upload(input: FileUploadInput): Promise<SecureFile> {
    const form = new FormData()
    form.append('file', input.file)
    if (input.name) form.append('name', input.name)
    ;(input.tags ?? []).forEach((tag) => form.append('tags', tag))

    return withMockFallback(
      () =>
        request<SecureFile>({
          url: '/files/upload/',
          method: 'POST',
          data: form,
          headers: { 'Content-Type': 'multipart/form-data' },
        }),
      () => mock.mockUploadFile(input),
    )
  },

  update(id: string, patch: Partial<SecureFile>): Promise<SecureFile> {
    return withMockFallback(
      () => request<SecureFile>({ url: `/files/${id}/`, method: 'PATCH', data: patch }),
      () => mock.mockUpdateFile(id, patch),
    )
  },

  remove(id: string): Promise<void> {
    return withMockFallback(
      () => request<void>({ url: `/files/${id}/`, method: 'DELETE' }),
      () => mock.mockDeleteFile(id),
    )
  },

  getPolicy(id: string): Promise<FilePolicy> {
    return withMockFallback(
      () => request<FilePolicy>({ url: `/files/${id}/policies/`, method: 'GET' }),
      () => mock.mockGetPolicy(id),
    )
  },

  /**
   * Persist the protection policy. The backend re-validates the payload and
   * always enforces permanent watermarking regardless of what the client sends.
   */
  updatePolicy(id: string, policy: FilePolicy): Promise<FilePolicy> {
    return withMockFallback(
      () => request<FilePolicy>({ url: `/files/${id}/policies/`, method: 'PATCH', data: policy }),
      () => mock.mockUpdatePolicy(id, policy),
    )
  },

  /** Download the filtered protected-file list as a CSV blob. */
  export(filters: FileFilters = {}): Promise<Blob> {
    return withMockFallback(
      () =>
        request<Blob>({
          url: '/files/export/',
          method: 'GET',
          params: {
            search: filters.search,
            status: filters.status,
            kind: filters.kind,
            ordering: filters.ordering,
          },
          responseType: 'blob',
        }),
      () => mock.mockExportFiles(filters),
    )
  },
}
