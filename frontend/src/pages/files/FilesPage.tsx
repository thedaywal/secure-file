import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Download, FolderLock, ShieldPlus } from 'lucide-react'

import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  TableSkeleton,
} from '@/components/common'
import { FileMobileList, FileTable } from '@/components/files'
import { useToast } from '@/context/ToastContext'
import { useAsync, useDebouncedValue, useDocumentTitle, usePagination } from '@/hooks'
import { adminPath } from '@/routes/navigation'
import { filesService } from '@/services/files.service'
import { sharesService } from '@/services/shares.service'
import { toApiError } from '@/services'
import { PROTECTION_STATUS_OPTIONS } from '@/utils/labels'
import type { SecureFile } from '@/types'

const STATUS_OPTIONS = [{ value: 'all', label: 'All statuses' }, ...PROTECTION_STATUS_OPTIONS]

const KIND_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'image', label: 'Images' },
  { value: 'pdf', label: 'PDF' },
  { value: 'document', label: 'Documents' },
]

type PendingAction = { action: 'revoke' | 'delete'; file: SecureFile }

/** Protected file library — the entry point to every file's policy and shares. */
export default function FilesPage() {
  useDocumentTitle('Protected files')
  const navigate = useNavigate()
  const toast = useToast()
  const [searchParams] = useSearchParams()

  const searchParam = searchParams.get('search') ?? ''
  const [searchInput, setSearchInput] = useState(searchParam)
  const debouncedSearch = useDebouncedValue(searchInput, 350)
  const [status, setStatus] = useState('all')
  const [kind, setKind] = useState('all')
  const { page, pageSize, setPage, setPageSize, reset } = usePagination(8)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [exporting, setExporting] = useState(false)

  /* The topbar global search links here with ?search=…, so mirror it. */
  useEffect(() => {
    setSearchInput(searchParam)
  }, [searchParam])

  /* Any filter change returns to the first page. */
  useEffect(() => {
    reset()
  }, [debouncedSearch, status, kind, reset])

  const { data, loading, error, reload } = useAsync(
    () =>
      filesService.list({
        page,
        pageSize,
        search: debouncedSearch || undefined,
        status: status === 'all' ? undefined : status,
        kind: kind === 'all' ? undefined : kind,
      }),
    [page, pageSize, debouncedSearch, status, kind],
  )

  const files = data?.results ?? []
  const totalItems = data?.count ?? 0
  const totalPages = data?.totalPages ?? 1
  const hasFilters = debouncedSearch.length > 0 || status !== 'all' || kind !== 'all'

  const handleRevoke = async (file: SecureFile) => {
    try {
      const shares = await sharesService.list({ fileId: file.id, pageSize: 100 })
      const active = shares.results.filter((share) => share.state === 'ACTIVE')
      await Promise.all(active.map((share) => sharesService.revoke(share.id)))
      await filesService.update(file.id, { protectionStatus: 'revoked' })
      toast.success('Access revoked', `${file.name} is no longer accessible to recipients.`)
      await reload()
    } catch (failure) {
      toast.error('Could not revoke access', toApiError(failure).message)
    }
  }

  const handleDelete = async (file: SecureFile) => {
    try {
      await filesService.remove(file.id)
      toast.success('File deleted', `${file.name} and its share links were removed.`)
      await reload()
    } catch (failure) {
      toast.error('Could not delete file', toApiError(failure).message)
    }
  }

  /* Export exactly what the operator sees — the current filters travel along. */
  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await filesService.export({
        search: debouncedSearch || undefined,
        status: status === 'all' ? undefined : status,
        kind: kind === 'all' ? undefined : kind,
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'securefile-export.csv'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      toast.success('Export ready', 'Your protected-file list was downloaded as a CSV.')
    } catch (failure) {
      toast.error('Could not export files', toApiError(failure).message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Protected files"
        description="Every file you have encrypted, watermarked and shared. Open a file to manage its protection policy, recipients and access activity."
        actions={
          <>
            <Button
              variant="outline"
              leftIcon={<Download size={16} />}
              onClick={handleExport}
              loading={exporting}
            >
              Export list
            </Button>
            <Button leftIcon={<ShieldPlus size={16} />} onClick={() => navigate(adminPath('/files/new'))}>
              Protect a file
            </Button>
          </>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-xs">
            <SearchInput
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onClear={() => setSearchInput('')}
              placeholder="Search files, extensions or tags…"
              aria-label="Search protected files"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="Filter by protection status"
              className="w-auto min-w-[168px]"
              value={status}
              options={STATUS_OPTIONS}
              onChange={(event) => setStatus(event.target.value)}
            />
            <Select
              aria-label="Filter by file type"
              className="w-auto min-w-[148px]"
              value={kind}
              options={KIND_OPTIONS}
              onChange={(event) => setKind(event.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={pageSize} columns={6} />
        ) : error ? (
          <ErrorState
            error={error}
            title="Could not load your files"
            onRetry={() => void reload()}
            className="py-12"
          />
        ) : files.length === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={<FolderLock size={20} />}
              title="No files match these filters"
              description="Try a different search term, or clear the status and type filters."
            />
          ) : (
            <EmptyState
              icon={<FolderLock size={20} />}
              title="No protected files yet"
              description="Encrypt a file and assign a protection policy to see it appear here."
              action={
                <Button leftIcon={<ShieldPlus size={16} />} onClick={() => navigate(adminPath('/files/new'))}>
                  Protect your first file
                </Button>
              }
            />
          )
        ) : (
          <>
            <div className="hidden lg:block">
              <FileTable
                files={files}
                onRevoke={(file) => setPending({ action: 'revoke', file })}
                onDelete={(file) => setPending({ action: 'delete', file })}
              />
            </div>
            <div className="lg:hidden">
              <FileMobileList
                files={files}
                onRevoke={(file) => setPending({ action: 'revoke', file })}
                onDelete={(file) => setPending({ action: 'delete', file })}
              />
            </div>
          </>
        )}

        {!loading && !error && files.length > 0 ? (
          <Pagination
            page={page}
            pageSize={pageSize}
            totalItems={totalItems}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemLabel="files"
          />
        ) : null}
      </Card>

      <ConfirmDialog
        open={pending?.action === 'revoke'}
        onClose={() => setPending(null)}
        onConfirm={async () => {
          if (pending) await handleRevoke(pending.file)
        }}
        title="Revoke access?"
        description={`Revoke every active share link for “${pending?.file.name ?? 'this file'}”? Recipients will lose access immediately.`}
        confirmLabel="Revoke access"
        tone="danger"
      />

      <ConfirmDialog
        open={pending?.action === 'delete'}
        onClose={() => setPending(null)}
        onConfirm={async () => {
          if (pending) await handleDelete(pending.file)
        }}
        title="Delete file?"
        description={`Permanently delete “${pending?.file.name ?? 'this file'}” and revoke its share links? This cannot be undone.`}
        confirmLabel="Delete file"
        tone="danger"
      />
    </div>
  )
}
