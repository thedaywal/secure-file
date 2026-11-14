import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Activity,
  Ban,
  FileSearch,
  MoreVertical,
  Share2,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'

import {
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dropdown,
  EmptyState,
  ErrorState,
  IconButton,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableSkeleton,
} from '@/components/common'
import { FileTypeIcon } from '@/components/files/FileTypeIcon'
import { LinkStateBadge } from '@/components/security/SecurityBadges'
import { useToast } from '@/context/ToastContext'
import { useAsync, useDebouncedValue, useDocumentTitle, useIsMobile, usePagination } from '@/hooks'
import { adminPath } from '@/routes/navigation'
import { toApiError } from '@/services'
import { sharesService } from '@/services/shares.service'
import { PermissionsModal } from '@/pages/sharing/PermissionsModal'
import { cn } from '@/utils/cn'
import { formatDateTime, formatUntil, isExpired } from '@/utils/format'
import { LINK_STATE_META } from '@/utils/labels'
import type { FileExtension, LinkState, ShareLink } from '@/types'

const KNOWN_EXTENSIONS: FileExtension[] = ['JPG', 'JPEG', 'PNG', 'WEBP']

/** Share links carry a filename, not an extension — derive a safe one. */
function extensionFor(name: string): FileExtension {
  const ext = name.split('.').pop()?.toUpperCase() as FileExtension | undefined
  return ext && KNOWN_EXTENSIONS.includes(ext) ? ext : 'PNG'
}

const STATE_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  ...(Object.keys(LINK_STATE_META) as LinkState[]).map((value) => ({
    value,
    label: LINK_STATE_META[value].label,
  })),
]

interface ShareActions {
  onViewActivity: (share: ShareLink) => void
  onViewFile: (share: ShareLink) => void
  onEditPermissions: (share: ShareLink) => void
  onRevoke: (share: ShareLink) => void
  onRemoveRecipient: (share: ShareLink) => void
}

function ShareRowActions({ share, actions }: { share: ShareLink; actions: ShareActions }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <IconButton
        label={`Delete recipient ${share.recipientUsername}`}
        size="sm"
        variant="ghost"
        className="text-danger-600 hover:bg-danger-50"
        onClick={() => actions.onRemoveRecipient(share)}
      >
        <Trash2 size={15} />
      </IconButton>
      <Dropdown
        align="right"
        trigger={({ toggle }) => (
          <IconButton label="Share actions" size="sm" variant="ghost" onClick={toggle}>
            <MoreVertical size={16} />
          </IconButton>
        )}
        items={[
          {
            id: 'recipient-activity',
            label: 'View activity',
            icon: <Activity size={15} />,
            onSelect: () => actions.onViewActivity(share),
          },
          {
            id: 'file-activity',
            label: 'File activity',
            icon: <FileSearch size={15} />,
            onSelect: () => actions.onViewFile(share),
          },
          {
            id: 'edit-permissions',
            label: 'Edit permissions',
            icon: <SlidersHorizontal size={15} />,
            onSelect: () => actions.onEditPermissions(share),
          },
          {
            id: 'revoke',
            label: 'Revoke access',
            icon: <Ban size={15} />,
            tone: 'danger',
            separated: true,
            onSelect: () => actions.onRevoke(share),
          },
        ]}
      />
    </div>
  )
}

function ExpirationCell({ share }: { share: ShareLink }) {
  const expired = isExpired(share.expiresAt)
  return (
    <p className={cn('whitespace-nowrap text-[12.5px]', expired ? 'text-danger-600' : 'text-ink-soft')}>
      {formatUntil(share.expiresAt)}
    </p>
  )
}

/** Shared-files library: every recipient-scoped share link in one register. */
export default function SharedFilesPage() {
  useDocumentTitle('Shared files')
  const navigate = useNavigate()
  const toast = useToast()
  const isMobile = useIsMobile()
  const [searchParams] = useSearchParams()

  const searchParam = searchParams.get('search') ?? ''
  const [searchInput, setSearchInput] = useState(searchParam)
  const [syncedSearchParam, setSyncedSearchParam] = useState(searchParam)
  const debouncedSearch = useDebouncedValue(searchInput, 350)
  const [state, setState] = useState<LinkState | 'all'>('all')
  const { page, pageSize, setPage, setPageSize, reset } = usePagination(8)
  const [permissionsShare, setPermissionsShare] = useState<ShareLink | null>(null)
  const [revoking, setRevoking] = useState<ShareLink | null>(null)
  const [removingRecipient, setRemovingRecipient] = useState<ShareLink | null>(null)

  /* The topbar global search links here with ?search=…, so mirror it. */
  if (searchParam !== syncedSearchParam) {
    setSyncedSearchParam(searchParam)
    setSearchInput(searchParam)
  }

  useEffect(() => {
    reset()
  }, [debouncedSearch, state, reset])

  const { data, loading, error, reload } = useAsync(
    () =>
      sharesService.list({
        page,
        pageSize,
        search: debouncedSearch || undefined,
        state: state === 'all' ? undefined : state,
      }),
    [page, pageSize, debouncedSearch, state],
  )

  const shares = data?.results ?? []
  const totalItems = data?.count ?? 0
  const totalPages = data?.totalPages ?? 1
  const hasFilters = debouncedSearch.length > 0 || state !== 'all'

  const actions: ShareActions = {
    onViewActivity: (share) =>
      navigate(adminPath(`/monitoring/recipients/${encodeURIComponent(share.recipientUsername)}`)),
    onViewFile: (share) => navigate(adminPath(`/monitoring/files/${share.fileId}`)),
    onEditPermissions: (share) => setPermissionsShare(share),
    onRevoke: (share) => setRevoking(share),
    onRemoveRecipient: (share) => setRemovingRecipient(share),
  }

  const handleRevoke = async (share: ShareLink) => {
    try {
      await sharesService.revoke(share.id)
      toast.success('Access revoked', `${share.recipientUsername} can no longer open ${share.fileName}.`)
      await reload()
    } catch (failure) {
      toast.error('Could not revoke access', toApiError(failure).message)
    }
  }

  const handleRemoveRecipient = async (share: ShareLink) => {
    try {
      await sharesService.removeRecipient(share.recipientId)
      toast.success('Recipient deleted', `${share.recipientUsername} and their access links were removed.`)
      if (shares.length === 1 && page > 1) setPage(page - 1)
      else await reload()
    } catch (failure) {
      toast.error('Could not delete recipient', toApiError(failure).message)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Shared files"
        description="Every recipient-scoped share link you have issued. Each recipient gets their own link and their own permanently watermarked rendition."
        actions={
          <Button variant="outline" onClick={() => navigate(adminPath('/monitoring'))}>
            Open monitoring
          </Button>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-xs">
            <SearchInput
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onClear={() => setSearchInput('')}
              placeholder="Search recipients or files…"
              aria-label="Search shared files"
            />
          </div>
          <Select
            aria-label="Filter by link state"
            className="w-auto min-w-[180px]"
            value={state}
            options={STATE_OPTIONS}
            onChange={(event) => setState(event.target.value as LinkState | 'all')}
          />
        </div>

        {loading ? (
          <TableSkeleton rows={pageSize} columns={8} />
        ) : error ? (
          <ErrorState
            error={error}
            title="Could not load shared files"
            onRetry={() => void reload()}
            className="py-12"
          />
        ) : shares.length === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={<Share2 size={20} />}
              title="No shares match these filters"
              description="Try a different search term, or clear the status filter."
            />
          ) : (
            <EmptyState
              icon={<Share2 size={20} />}
              title="Nothing shared yet"
              description="Share a protected file to issue recipient-scoped links that will appear here."
              action={<Button onClick={() => navigate(adminPath('/files'))}>Go to protected files</Button>}
            />
          )
        ) : isMobile ? (
          <ul className="divide-y divide-line">
            {shares.map((share) => (
              <li key={share.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={share.recipientUsername} size="md" />
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[13px] font-medium text-ink">
                        {share.recipientUsername}
                      </p>
                      <p className="truncate text-[12px] text-ink-muted">{share.fileName}</p>
                      {share.albumId ? (
                        <p className="text-[11px] text-ink-muted">{share.imageCount} images</p>
                      ) : null}
                    </div>
                  </div>
                  <ShareRowActions share={share} actions={actions} />
                </div>

                <div className="flex items-center gap-2.5">
                  <FileTypeIcon extension={extensionFor(share.fileName)} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] text-ink-soft">{share.fileName}</p>
                    <p className="text-[11.5px] text-ink-muted">
                      Shared {formatDateTime(share.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <LinkStateBadge state={share.state} />
                  <Badge tone={isExpired(share.expiresAt) ? 'danger' : 'neutral'} size="sm">
                    {formatUntil(share.expiresAt)}
                  </Badge>
                  <span className="text-[11.5px] text-ink-muted">
                    {share.successfulViews} views · {share.failedAttempts} failed
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Table>
            <TableHead>
              <TableHeaderCell>Recipient</TableHeaderCell>
              <TableHeaderCell>File</TableHeaderCell>
              <TableHeaderCell>Shared</TableHeaderCell>
              <TableHeaderCell>Expiration</TableHeaderCell>
              <TableHeaderCell>Link state</TableHeaderCell>
              <TableHeaderCell align="right">Views</TableHeaderCell>
              <TableHeaderCell align="right">Failed</TableHeaderCell>
              <TableHeaderCell align="right">
                <span className="sr-only">Actions</span>
              </TableHeaderCell>
            </TableHead>
            <TableBody>
              {shares.length === 0 ? (
                <TableEmptyRow colSpan={8}>
                  <p className="px-5 py-10 text-center text-[13px] text-ink-muted">
                    No share links to display.
                  </p>
                </TableEmptyRow>
              ) : (
                shares.map((share) => (
                  <TableRow key={share.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={share.recipientUsername} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-mono text-[12.5px] font-medium text-ink">
                            {share.recipientUsername}
                          </p>
                          <p className="truncate text-[11.5px] text-ink-muted">
                            {share.fileName}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <FileTypeIcon extension={extensionFor(share.fileName)} size="sm" />
                        <div className="min-w-0">
                          <p className="max-w-[190px] truncate text-[13px] text-ink-soft">
                            {share.fileName}
                          </p>
                          {share.albumId ? (
                            <p className="text-[11px] text-ink-muted">{share.imageCount} images</p>
                          ) : null}
                          <p className="font-mono text-[11px] text-ink-muted">
                            {share.tokenPreview}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="whitespace-nowrap text-[12.5px] text-ink-soft">
                        {formatDateTime(share.createdAt)}
                      </p>
                    </TableCell>
                    <TableCell>
                      <ExpirationCell share={share} />
                    </TableCell>
                    <TableCell>
                      <LinkStateBadge state={share.state} />
                    </TableCell>
                    <TableCell align="right">
                      <span className="text-[13px] tabular-nums text-ink-soft">
                        {share.successfulViews}
                      </span>
                    </TableCell>
                    <TableCell align="right">
                      <span
                        className={cn(
                          'text-[13px] tabular-nums',
                          share.failedAttempts > 0 ? 'text-danger-600' : 'text-ink-muted',
                        )}
                      >
                        {share.failedAttempts}
                      </span>
                    </TableCell>
                    <TableCell align="right">
                      <ShareRowActions share={share} actions={actions} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}

        {!loading && !error && shares.length > 0 ? (
          <Pagination
            page={page}
            pageSize={pageSize}
            totalItems={totalItems}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemLabel="shares"
          />
        ) : null}
      </Card>

      <PermissionsModal
        share={permissionsShare}
        onClose={() => setPermissionsShare(null)}
        onSaved={() => void reload()}
      />

      <ConfirmDialog
        open={Boolean(revoking)}
        onClose={() => setRevoking(null)}
        onConfirm={async () => {
          if (revoking) await handleRevoke(revoking)
        }}
        title="Revoke access?"
        description={`Revoke the share link for ${revoking?.recipientUsername ?? 'this recipient'}? They will immediately lose access to ${revoking?.fileName ?? 'the file'}.`}
        confirmLabel="Revoke access"
        tone="danger"
      />

      <ConfirmDialog
        open={Boolean(removingRecipient)}
        onClose={() => setRemovingRecipient(null)}
        onConfirm={async () => {
          if (removingRecipient) await handleRemoveRecipient(removingRecipient)
        }}
        title="Delete recipient?"
        description={
          removingRecipient
            ? `${removingRecipient.recipientUsername} will lose access to ${removingRecipient.fileName}${removingRecipient.albumId ? ` (${removingRecipient.imageCount} images)` : ''}. Their links and sessions will be deleted; access logs and watermark records are kept.`
            : undefined
        }
        confirmLabel="Delete recipient"
        tone="danger"
      />
    </div>
  )
}
