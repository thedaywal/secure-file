import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, Hash, RefreshCw, ScanSearch, ShieldAlert, ShieldCheck, Stamp } from 'lucide-react'

import {
  Alert,
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  PageHeader,
  Pagination,
  SearchInput,
  StatCard,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableSkeleton,
  Tooltip,
} from '@/components/common'
import { FileTypeIcon } from '@/components/files/FileTypeIcon'
import { WatermarkVerificationBadge } from '@/components/security/SecurityBadges'
import { HashCopy } from '@/pages/watermarks/watermarkParts'
import { LeakInvestigationModal } from '@/pages/watermarks/LeakInvestigationModal'
import { useToast } from '@/context/ToastContext'
import { useAsync, useDebouncedValue, useDocumentTitle, usePagination } from '@/hooks'
import { adminPath } from '@/routes/navigation'
import { toApiError } from '@/services'
import { watermarkService } from '@/services/watermark.service'
import { formatDateTime, formatRelativeTime } from '@/utils/format'
import type { WatermarkRecord } from '@/types'

/** Watermark records — one row per recipient-scoped, backend-generated rendition. */
export default function WatermarksPage() {
  useDocumentTitle('Watermark records')
  const navigate = useNavigate()
  const toast = useToast()

  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput, 350)
  const { page, pageSize, setPage, setPageSize, reset } = usePagination(8)
  const [verifyingId, setVerifyingId] = useState<string | null>(null)
  const [investigateOpen, setInvestigateOpen] = useState(false)

  /* Any filter change returns to the first page. */
  useEffect(() => {
    reset()
  }, [debouncedSearch, reset])

  const listState = useAsync(
    () =>
      watermarkService.list({
        page,
        pageSize,
        search: debouncedSearch || undefined,
      }),
    [page, pageSize, debouncedSearch],
  )

  /* A broad page is fetched purely to derive honest status counts for the
     summary row; the scope is labelled on each card. */
  const statsState = useAsync(() => watermarkService.list({ pageSize: 100 }), [])

  const records = listState.data?.results ?? []
  const totalItems = listState.data?.count ?? 0
  const totalPages = listState.data?.totalPages ?? 1

  const sample = statsState.data?.results ?? []
  const verifiedCount = sample.filter((item) => item.verificationStatus === 'verified').length
  const mismatchCount = sample.filter((item) => item.verificationStatus === 'mismatch').length
  const unverifiedCount = sample.filter((item) => item.verificationStatus === 'unverified').length
  const scopeHint = `Sampled from the latest ${sample.length} rendition${sample.length === 1 ? '' : 's'}`

  const handleVerify = async (record: WatermarkRecord) => {
    setVerifyingId(record.id)
    try {
      const updated = await watermarkService.verify(record.id)
      toast.success(
        'Integrity verified',
        `The ${updated.fileName} rendition hash matches the recorded output.`,
      )
      await listState.reload()
      await statsState.reload({ silent: true })
    } catch (failure) {
      toast.error('Verification failed', toApiError(failure).message)
    } finally {
      setVerifyingId(null)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Watermark records"
        description="Every recipient-scoped rendition the backend generated. The watermark is baked into the image pixels — the previews here only surface the audit metadata."
        badge={<BadgeStamp />}
      />

      <Alert tone="info" title="Watermarks are embedded by the backend">
        Permanent, recipient-specific watermarks are written directly into the generated image
        pixels before a file is served — they are not a CSS overlay and cannot be removed in the
        browser.
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Watermark renditions"
          value={totalItems}
          icon={<Stamp size={18} />}
          tone="brand"
          loading={statsState.loading}
          hint={statsState.loading ? undefined : scopeHint}
        />
        <StatCard
          label="Verified"
          value={verifiedCount}
          icon={<ShieldCheck size={18} />}
          tone="success"
          loading={statsState.loading}
        />
        <StatCard
          label="Hash mismatches"
          value={mismatchCount}
          icon={<ShieldAlert size={18} />}
          tone="danger"
          loading={statsState.loading}
        />
        <StatCard
          label="Not yet verified"
          value={unverifiedCount}
          icon={<Hash size={18} />}
          tone="neutral"
          loading={statsState.loading}
        />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-xs">
            <SearchInput
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onClear={() => setSearchInput('')}
              placeholder="Search files, recipients or access IDs…"
              aria-label="Search watermark records"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<ScanSearch size={15} />}
            onClick={() => setInvestigateOpen(true)}
          >
            Investigate a leak
          </Button>
        </div>

        {listState.loading ? (
          <TableSkeleton rows={pageSize} columns={7} />
        ) : listState.error ? (
          <ErrorState
            error={listState.error}
            title="Could not load watermark records"
            onRetry={() => void listState.reload()}
            className="py-12"
          />
        ) : records.length === 0 ? (
          <EmptyState
            icon={<Stamp size={20} />}
            title={debouncedSearch ? 'No records match this search' : 'No watermark records yet'}
            description={
              debouncedSearch
                ? 'Try a different file name, recipient or access ID.'
                : 'Watermark records appear once the backend generates a recipient-scoped rendition.'
            }
          />
        ) : (
          <>
            <div className="hidden lg:block">
              <Table>
                <TableHead>
                  <TableHeaderCell>Original file</TableHeaderCell>
                  <TableHeaderCell>Recipient</TableHeaderCell>
                  <TableHeaderCell>Access ID</TableHeaderCell>
                  <TableHeaderCell>Generated</TableHeaderCell>
                  <TableHeaderCell>Output hash</TableHeaderCell>
                  <TableHeaderCell>Verification</TableHeaderCell>
                  <TableHeaderCell align="right">Actions</TableHeaderCell>
                </TableHead>
                <TableBody>
                  {records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <FileTypeIcon extension={record.extension} size="sm" />
                          <span className="truncate font-medium text-ink">{record.fileName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-ink-soft">
                        {record.recipientUsername}
                      </TableCell>
                      <TableCell>
                        <code className="font-mono text-[12px] text-ink-soft">{record.accessId}</code>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{formatDateTime(record.generatedAt)}</span>
                          <span className="text-[11.5px] text-ink-muted">
                            {formatRelativeTime(record.generatedAt)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <HashCopy hash={record.outputHash} />
                      </TableCell>
                      <TableCell>
                        <WatermarkVerificationBadge status={record.verificationStatus} />
                      </TableCell>
                      <TableCell align="right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={<Eye size={14} />}
                            onClick={() => navigate(adminPath(`/watermarks/${record.id}`))}
                          >
                            Inspect
                          </Button>
                          <Tooltip content="Recompute the output hash and confirm integrity">
                            <IconButton
                              label="Verify integrity"
                              size="sm"
                              variant="outline"
                              loading={verifyingId === record.id}
                              onClick={() => void handleVerify(record)}
                            >
                              <RefreshCw size={14} />
                            </IconButton>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="divide-y divide-line lg:hidden">
              {records.map((record) => (
                <WatermarkMobileCard
                  key={record.id}
                  record={record}
                  verifying={verifyingId === record.id}
                  onInspect={() => navigate(adminPath(`/watermarks/${record.id}`))}
                  onVerify={() => void handleVerify(record)}
                />
              ))}
            </div>
          </>
        )}

        {!listState.loading && !listState.error && records.length > 0 ? (
          <Pagination
            page={page}
            pageSize={pageSize}
            totalItems={totalItems}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemLabel="renditions"
          />
        ) : null}
      </Card>

      <LeakInvestigationModal
        open={investigateOpen}
        onClose={() => setInvestigateOpen(false)}
        onInspect={(recordId) => {
          setInvestigateOpen(false)
          navigate(adminPath(`/watermarks/${recordId}`))
        }}
      />
    </div>
  )
}

/**
 * Inline brand badge for the header. Kept local so the page owns nothing
 * shared; the same visual language is used across the app.
 */
function BadgeStamp() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-subtle px-2.5 py-1 text-[11.5px] font-medium text-ink-soft">
      <Stamp size={12} className="text-brand-600" />
      Backend-embedded
    </span>
  )
}

interface WatermarkMobileCardProps {
  record: WatermarkRecord
  verifying: boolean
  onInspect: () => void
  onVerify: () => void
}

function WatermarkMobileCard({ record, verifying, onInspect, onVerify }: WatermarkMobileCardProps) {
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-start gap-3">
        <FileTypeIcon extension={record.extension} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-ink">{record.fileName}</p>
          <p className="truncate font-mono text-[12.5px] text-ink-muted">
            {record.recipientUsername}
          </p>
        </div>
        <WatermarkVerificationBadge status={record.verificationStatus} />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
        <div className="col-span-2">
          <dt className="text-ink-muted">Access ID</dt>
          <dd className="font-mono text-[12px] text-ink-soft">{record.accessId}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Generated</dt>
          <dd className="text-ink-soft">{formatRelativeTime(record.generatedAt)}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Output hash</dt>
          <dd>
            <HashCopy hash={record.outputHash} edge={6} />
          </dd>
        </div>
      </dl>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" leftIcon={<Eye size={14} />} onClick={onInspect}>
          Inspect
        </Button>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<RefreshCw size={14} />}
          loading={verifying}
          onClick={onVerify}
        >
          Verify integrity
        </Button>
      </div>
    </div>
  )
}
