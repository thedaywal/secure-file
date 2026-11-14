import { loadMock, request, withMockFallback } from '@/services/api'
import type {
  Album,
  AlbumUploadInput,
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
      async () => (await loadMock()).mockListFiles(filters),
    )
  },

  get(id: string): Promise<SecureFile> {
    return withMockFallback(
      () => request<SecureFile>({ url: `/files/${id}/`, method: 'GET' }),
      async () => (await loadMock()).mockGetFile(id),
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
      async () => (await loadMock()).mockUploadFile(input),
    )
  },

  uploadAlbum(input: AlbumUploadInput): Promise<Album> {
    const form = new FormData()
    form.append('name', input.name)
    input.files.forEach((file) => form.append('files', file))
    ;(input.tags ?? []).forEach((tag) => form.append('tags', tag))

    return withMockFallback(
      () =>
        request<Album>({
          url: '/albums/upload/',
          method: 'POST',
          data: form,
          headers: { 'Content-Type': 'multipart/form-data' },
        }),
      async () => (await loadMock()).mockUploadAlbum(input),
    )
  },

  update(id: string, patch: Partial<SecureFile>): Promise<SecureFile> {
    return withMockFallback(
      () => request<SecureFile>({ url: `/files/${id}/`, method: 'PATCH', data: patch }),
      async () => (await loadMock()).mockUpdateFile(id, patch),
    )
  },

  remove(id: string): Promise<void> {
    return withMockFallback(
      () => request<void>({ url: `/files/${id}/`, method: 'DELETE' }),
      async () => (await loadMock()).mockDeleteFile(id),
    )
  },

  getPolicy(id: string): Promise<FilePolicy> {
    return withMockFallback(
      () => request<FilePolicy>({ url: `/files/${id}/policies/`, method: 'GET' }),
      async () => (await loadMock()).mockGetPolicy(id),
    )
  },

  /**
   * Persist the protection policy. The backend re-validates the payload and
   * always enforces permanent watermarking regardless of what the client sends.
   */
  updatePolicy(id: string, policy: FilePolicy): Promise<FilePolicy> {
    return withMockFallback(
      () => request<FilePolicy>({ url: `/files/${id}/policies/`, method: 'PATCH', data: policy }),
      async () => (await loadMock()).mockUpdatePolicy(id, policy),
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
      async () => (await loadMock()).mockExportFiles(filters),
    )
  },
}
