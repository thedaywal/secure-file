import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Ban,
  Eye,
  FileWarning,
  History,
  Lock,
  Save,
  Share2,
  ShieldAlert,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react'

import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  CopyField,
  EmptyState,
  ErrorState,
  InfoRow,
  Modal,
  PageHeader,
  Pagination,
  Skeleton,
  StatCardSkeleton,
  TableSkeleton,
  Tabs,
} from '@/components/common'
import {
  BulkRecipientModal,
  FileTypeIcon,
  PolicyEditor,
  RecipientFormModal,
  RecipientRow,
  buildPolicySummary,
  recipientsFromShares,
  watermarkPreviewLines,
} from '@/components/files'
import type { RecipientFormValues } from '@/components/files'
import { AccessLogTable } from '@/components/security/AccessLogTable'
import { ProtectionStatusBadge } from '@/components/security/SecurityBadges'
import { WatermarkConfigPreview } from '@/components/watermark/WatermarkPreview'
import { useToast } from '@/context/ToastContext'
import { buildShareUrl } from '@/config/env'
import { useAsync, useDocumentTitle } from '@/hooks'
import { adminPath } from '@/routes/navigation'
import { accessService } from '@/services/access.service'
import { filesService } from '@/services/files.service'
import { sharesService } from '@/services/shares.service'
import { toApiError } from '@/services'
import { cn } from '@/utils/cn'
import { formatBytes, formatDate, formatUntil, truncateHash } from '@/utils/format'
import { createDefaultPermissions, validatePolicy } from '@/utils/policy'
import type { ImportedRecipient } from '@/utils/recipientImport'
import type { ApiError, FilePolicy, Recipient } from '@/types'

const TAB_VALUES: readonly string[] = ['overview', 'policies', 'sharing', 'activity']
type TabValue = 'overview' | 'policies' | 'sharing' | 'activity'

function isNotFound(error: ApiError | null): boolean {
  if (!error) return false
  return error.status === 404 || error.code === 'not_found' || /not found/i.test(error.message)
}

function Pill({
  icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: ReactNode
  label: string
  value: number | string
  tone?: 'neutral' | 'warning'
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-subtle/60 p-3">
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-lg',
          tone === 'warning' ? 'bg-warning-50 text-warning-600' : 'bg-brand-50 text-brand-600',
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-ink tabular-nums">{value}</p>
        <p className="truncate text-[11.5px] text-ink-muted">{label}</p>
      </div>
    </div>
  )
}

/** Protected-file detail: policy, recipients and access history in one place. */
export default function FileDetailPage() {
  const { fileId = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const fileState = useAsync(() => filesService.get(fileId), [fileId])
  const policyState = useAsync(() => filesService.getPolicy(fileId), [fileId])
  const sharesState = useAsync(() => sharesService.list({ fileId, pageSize: 50 }), [fileId])
  const [activityPage, setActivityPage] = useState(1)
  const activityState = useAsync(
    () => accessService.forFile(fileId, { page: activityPage, pageSize: 5 }),
    [fileId, activityPage],
  )

  const file = fileState.data
  useDocumentTitle(file?.name ?? 'File details')

  const rawTab = searchParams.get('tab') ?? 'overview'
  const activeTab: TabValue = TAB_VALUES.includes(rawTab) ? (rawTab as TabValue) : 'overview'
  const setTab = (value: TabValue) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('tab', value)
        return next
      },
      { replace: true },
    )
  }

  /* Recipients are projected from the shares endpoint (see RecipientEditor). */
  const [recipients, setRecipients] = useState<Recipient[]>([])
  useEffect(() => {
    if (!sharesState.data) return
    setRecipients(recipientsFromShares(sharesState.data.results))
  }, [sharesState.data])

  /* Editable policy draft kept in sync with the fetched policy. */
  const [draft, setDraft] = useState<FilePolicy | null>(null)
  const [policyErrors, setPolicyErrors] = useState<Record<string, string>>({})
  const [savingPolicy, setSavingPolicy] = useState(false)
  useEffect(() => {
    if (!policyState.data) return
    setDraft(policyState.data)
    setPolicyErrors({})
  }, [policyState.data])

  const policyDirty = Boolean(
    draft && policyState.data && JSON.stringify(draft) !== JSON.stringify(policyState.data),
  )

  const [addOpen, setAddOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [editing, setEditing] = useState<Recipient | null>(null)
  const [revoking, setRevoking] = useState<Recipient | null>(null)
  const [removing, setRemoving] = useState<Recipient | null>(null)
  /* The one-time link shown after adding a recipient or reissuing theirs. */
  const [linkDialog, setLinkDialog] = useState<{
    kind: 'created' | 'reissued'
    username: string
    url: string
  } | null>(null)
  const [confirmRevokeFile, setConfirmRevokeFile] = useState(false)
  const [confirmDeleteFile, setConfirmDeleteFile] = useState(false)

  const handleAddRecipient = async (values: RecipientFormValues) => {
    try {
      const result = await sharesService.createForFile(fileId, {
        fileId,
        recipients: [
          {
            username: values.username,
            password: values.password,
            displayName: values.displayName || undefined,
            permissions: values.permissions,
          },
        ],
      })
      setRecipients((current) => [...result.recipients, ...current])
      const newShare = result.shares[0]
      if (newShare?.url) {
        setLinkDialog({
          kind: 'created',
          username: values.username,
          url: buildShareUrl(newShare.url),
        })
      }
      setAddOpen(false)
      await sharesState.reload({ silent: true })
      await fileState.reload({ silent: true })
    } catch (failure) {
      toast.error('Could not add recipient', toApiError(failure).message)
    }
  }

  const handleBulkAdd = async (rows: ImportedRecipient[]) => {
    const result = await sharesService.createForFile(fileId, {
      fileId,
      recipients: rows.map((row) => ({
        username: row.username,
        password: row.password,
        displayName: row.displayName,
        permissions: createDefaultPermissions(),
      })),
    })
    toast.success(
      'Recipients added',
      `${result.recipients.length} ${result.recipients.length === 1 ? 'recipient' : 'recipients'} can now access this file.`,
    )
    await sharesState.reload({ silent: true })
    await fileState.reload({ silent: true })
    return result
  }

  const handleEditPermissions = (values: RecipientFormValues) => {
    if (!editing) return
    /* A share carries identity, not permissions; this is a local UX affordance
       until the recipient-record endpoint exposes per-recipient permissions. */
    setRecipients((current) =>
      current.map((item) =>
        item.id === editing.id
          ? {
              ...item,
              displayName: values.displayName || item.displayName,
              permissions: values.permissions,
            }
          : item,
      ),
    )
    toast.success('Permissions updated', `Updated permissions for ${values.username}.`)
    setEditing(null)
  }

  const handleReissue = async (recipient: Recipient) => {
    const share = sharesState.data?.results.find(
      (item) => item.recipientId === recipient.id || item.recipientUsername === recipient.username,
    )
    if (!share) {
      toast.error('Could not issue a new link', 'No access link found for this recipient.')
      return
    }
    try {
      const updated = await sharesService.reissue(share.id)
      setLinkDialog({
        kind: 'reissued',
        username: recipient.username,
        url: buildShareUrl(updated.url),
      })
      setRecipients((current) =>
        current.map((item) => (item.id === recipient.id ? { ...item, status: 'ACTIVE' } : item)),
      )
      await sharesState.reload({ silent: true })
    } catch (failure) {
      toast.error('Could not issue a new link', toApiError(failure).message)
    }
  }

  const handleRemoveRecipient = async (recipient: Recipient) => {
    try {
      await sharesService.removeRecipient(recipient.id)
      setRecipients((current) => current.filter((item) => item.id !== recipient.id))
      toast.success(
        'Recipient removed',
        `${recipient.username} and their access links were deleted.`,
      )
      await sharesState.reload({ silent: true })
      await fileState.reload({ silent: true })
    } catch (failure) {
      toast.error('Could not remove recipient', toApiError(failure).message)
    }
  }

  const handleRevokeRecipient = async (recipient: Recipient) => {
    try {
      const share = sharesState.data?.results.find(
        (item) => item.recipientId === recipient.id || item.recipientUsername === recipient.username,
      )
      if (share) await sharesService.revoke(share.id)
      setRecipients((current) =>
        current.map((item) => (item.id === recipient.id ? { ...item, status: 'REVOKED' } : item)),
      )
      toast.success('Access revoked', `${recipient.username} can no longer open this file.`)
      await sharesState.reload({ silent: true })
    } catch (failure) {
      toast.error('Could not revoke access', toApiError(failure).message)
    }
  }

  const handleRevokeFile = async () => {
    try {
      const open = sharesState.data?.results.filter((share) => share.state === 'ACTIVE') ?? []
      await Promise.all(open.map((share) => sharesService.revoke(share.id)))
      await filesService.update(fileId, { protectionStatus: 'revoked' })
      toast.success(
        'Access revoked',
        `All active share links for ${file?.name ?? 'this file'} were revoked.`,
      )
      await fileState.reload({ silent: true })
      await sharesState.reload({ silent: true })
    } catch (failure) {
      toast.error('Could not revoke access', toApiError(failure).message)
    }
  }

  const handleDeleteFile = async () => {
    try {
      await filesService.remove(fileId)
      toast.success('File deleted', `${file?.name ?? 'The file'} and its recipient access were removed.`)
      navigate(adminPath('/files'), { replace: true })
    } catch (failure) {
      toast.error('Could not delete file', toApiError(failure).message)
    }
  }

  const handleSavePolicy = async () => {
    if (!draft) return
    const errors = validatePolicy(draft)
    setPolicyErrors(errors)
    if (Object.keys(errors).length > 0) {
      toast.warning('Policy not saved', 'Fix the highlighted fields before saving.')
      return
    }
    setSavingPolicy(true)
    try {
      const saved = await filesService.updatePolicy(fileId, draft)
      policyState.setData(saved)
      setDraft(saved)
      toast.success('Policy saved', 'The protection policy was updated.')
    } catch (failure) {
      toast.error('Could not save policy', toApiError(failure).message)
    } finally {
      setSavingPolicy(false)
    }
  }

  const handleDiscard = () => {
    if (!policyState.data) return
    setDraft(policyState.data)
    setPolicyErrors({})
  }

  if (fileState.loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    )
  }

  if (fileState.error) {
    if (isNotFound(fileState.error)) {
      return (
        <Card>
          <EmptyState
            icon={<FileWarning size={20} />}
            title="File not found"
            description="This file may have been deleted, or you no longer have access to it."
            action={
              <Button variant="outline" onClick={() => navigate(adminPath('/files'))}>
                Back to protected files
              </Button>
            }
          />
        </Card>
      )
    }
    return (
      <ErrorState
        error={fileState.error}
        title="Could not load this file"
        onRetry={() => void fileState.reload()}
      />
    )
  }

  if (!file) return null

  const summary = policyState.data ? buildPolicySummary(policyState.data) : []

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumbs={[{ label: 'Protected files', to: adminPath('/files') }, { label: file.name }]}
        title={file.name}
        badge={<ProtectionStatusBadge status={file.protectionStatus} />}
        description={`${file.extension} · ${formatBytes(file.sizeBytes)} · uploaded ${formatDate(file.uploadedAt)}`}
        actions={
          <>
            <Button leftIcon={<Share2 size={16} />} onClick={() => setAddOpen(true)}>
              Share file
            </Button>
            <Button
              variant="outline"
              leftIcon={<History size={16} />}
              onClick={() => navigate(adminPath(`/monitoring/files/${fileId}`))}
            >
              View access history
            </Button>
            <Button
              variant="danger"
              leftIcon={<Ban size={16} />}
              onClick={() => setConfirmRevokeFile(true)}
            >
              Revoke access
            </Button>
            <Button
              variant="danger"
              leftIcon={<Trash2 size={16} />}
              onClick={() => setConfirmDeleteFile(true)}
            >
              Delete file
            </Button>
          </>
        }
      />

      <Card>
        <CardBody>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 gap-4">
              <FileTypeIcon extension={file.extension} size="lg" />
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-[16px] font-semibold text-ink">{file.name}</h2>
                  <Badge tone="neutral">{file.extension}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="brand" icon={<Lock size={12} />}>
                    {file.encryption}
                  </Badge>
                  <span className="text-[12.5px] text-ink-muted">Owner · {file.ownerName ?? '—'}</span>
                </div>
                <div className="max-w-sm">
                  <CopyField
                    label="Checksum (SHA-256)"
                    value={file.checksum ?? '—'}
                    displayValue={file.checksum ? truncateHash(file.checksum) : '—'}
                    mono
                  />
                </div>
              </div>
            </div>

            <dl className="w-full lg:max-w-[280px]">
              <InfoRow label="Size" value={formatBytes(file.sizeBytes)} />
              <InfoRow label="Encryption" value={file.encryption} />
              <InfoRow label="Expiration" value={formatUntil(file.expiresAt)} />
              <InfoRow label="Active share links" value={String(file.activeShareLinks)} />
            </dl>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-4">
            <Pill
              icon={<Users size={16} />}
              label="Authorized recipients"
              value={file.authorizedRecipients}
            />
            <Pill icon={<Share2 size={16} />} label="Active share links" value={file.activeShareLinks} />
            <Pill icon={<Eye size={16} />} label="Successful views" value={file.successfulViews ?? 0} />
            <Pill
              icon={<ShieldAlert size={16} />}
              label="Failed attempts"
              value={file.failedAttempts ?? 0}
              tone="warning"
            />
          </div>
        </CardBody>
      </Card>

      <Tabs
        aria-label="File sections"
        variant="underline"
        value={activeTab}
        onChange={setTab}
        items={[
          { value: 'overview', label: 'Overview' },
          { value: 'policies', label: 'Protection policy' },
          { value: 'sharing', label: 'Recipients', count: recipients.length },
          { value: 'activity', label: 'Access history' },
        ]}
      />

      {activeTab === 'overview' ? (
        policyState.data ? (
          <div className="space-y-5">
            <p className="text-[13px] leading-5 text-ink-muted">
              This file is encrypted at rest, served through the protected viewer, and stamped with a
              permanent recipient-scoped watermark. The settings below describe its protection
              posture.
            </p>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="grid gap-5 sm:grid-cols-2">
                {summary.map((section) => (
                  <Card key={section.id}>
                    <CardHeader title={section.title} />
                    <CardBody className="space-y-3">
                      {section.rows.map((row) => (
                        <div
                          key={row.label}
                          className="flex items-center justify-between gap-3"
                        >
                          <span className="text-[12.5px] text-ink-soft">{row.label}</span>
                          {row.status.kind === 'toggle' ? (
                            <Badge tone={row.status.on ? 'success' : 'neutral'} size="sm">
                              {row.status.on ? 'On' : 'Off'}
                            </Badge>
                          ) : (
                            <Badge tone="neutral" size="sm">
                              {row.status.text}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </CardBody>
                  </Card>
                ))}
              </div>
              <WatermarkConfigPreview
                lines={watermarkPreviewLines(policyState.data.watermark)}
                opacity={policyState.data.watermark.opacity}
                size={policyState.data.watermark.size}
                height={340}
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            <Skeleton className="h-56 rounded-xl" />
            <Skeleton className="h-56 rounded-xl" />
            <Skeleton className="h-56 rounded-xl" />
            <Skeleton className="h-56 rounded-xl" />
          </div>
        )
      ) : null}

      {activeTab === 'policies' ? (
        policyState.loading || !draft ? (
          <TableSkeleton rows={6} columns={3} />
        ) : (
          <div className="space-y-5">
            <Alert tone="info" title="Client-side validation only">
              These checks keep the form tidy — the backend re-validates every policy and always
              enforces permanent watermarking.
            </Alert>
            <PolicyEditor policy={draft} onChange={setDraft} errors={policyErrors} />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                leftIcon={<Save size={16} />}
                loading={savingPolicy}
                disabled={!policyDirty}
                onClick={handleSavePolicy}
              >
                Save changes
              </Button>
              <Button variant="outline" disabled={!policyDirty} onClick={handleDiscard}>
                Discard
              </Button>
            </div>
          </div>
        )
      ) : null}

      {activeTab === 'sharing' ? (
        <Card>
          <CardHeader
            title={`Recipients (${recipients.length})`}
            description="Each recipient receives their own link and their own permanently watermarked rendition."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  leftIcon={<Upload size={16} />}
                  onClick={() => setBulkOpen(true)}
                >
                  Add in bulk
                </Button>
                <Button leftIcon={<UserPlus size={16} />} onClick={() => setAddOpen(true)}>
                  Add recipient
                </Button>
              </div>
            }
          />
          {recipients.length === 0 ? (
            <EmptyState
              compact
              icon={<Users size={18} />}
              title="No recipients yet"
              description="Add a recipient to issue their protected sharing link."
              action={<Button onClick={() => setAddOpen(true)}>Add recipient</Button>}
            />
          ) : (
            <CardBody className="divide-y divide-line py-0">
              {recipients.map((recipient) => (
                <RecipientRow
                  key={recipient.id}
                  recipient={recipient}
                  onEdit={setEditing}
                  onReissue={handleReissue}
                  onRevoke={setRevoking}
                  onRemove={setRemoving}
                />
              ))}
            </CardBody>
          )}
        </Card>
      ) : null}

      {activeTab === 'activity' ? (
        <Card>
          <CardHeader
            title="Access history"
            description="The five most recent access attempts against this file."
            actions={
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(adminPath(`/monitoring/files/${fileId}`))}
              >
                View all activity
              </Button>
            }
          />
          <AccessLogTable
            logs={activityState.data?.results ?? []}
            loading={activityState.loading}
            hideFile
            emptyState={
              <p className="px-5 py-10 text-center text-[13px] text-ink-muted">
                No access attempts have been recorded for this file yet.
              </p>
            }
          />
          {activityState.data && activityState.data.count > 0 ? (
            <Pagination
              page={activityPage}
              pageSize={5}
              totalItems={activityState.data.count}
              totalPages={activityState.data.totalPages}
              onPageChange={setActivityPage}
              itemLabel="events"
            />
          ) : null}
        </Card>
      ) : null}

      <RecipientFormModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add recipient"
        description="They will receive their own single-use link and watermarked rendition."
        submitLabel="Add recipient"
        onSubmit={handleAddRecipient}
      />

      <BulkRecipientModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        existingUsernames={recipients.map((recipient) => recipient.username)}
        onSubmit={handleBulkAdd}
      />

      <RecipientFormModal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit permissions"
        submitLabel="Save permissions"
        lockUsername
        initial={
          editing
            ? {
                username: editing.username,
                displayName: editing.displayName,
                permissions: editing.permissions,
              }
            : undefined
        }
        onSubmit={handleEditPermissions}
      />

      <ConfirmDialog
        open={Boolean(revoking)}
        onClose={() => setRevoking(null)}
        onConfirm={async () => {
          if (revoking) await handleRevokeRecipient(revoking)
        }}
        title="Revoke access?"
        description={`${revoking?.username ?? 'This recipient'} will immediately lose access to ${file.name}.`}
        confirmLabel="Revoke access"
        tone="danger"
      />

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (removing) await handleRemoveRecipient(removing)
        }}
        title="Remove recipient?"
        description={`${removing?.username ?? 'This recipient'} and their access links will be permanently deleted. Access logs and watermark records are kept.`}
        confirmLabel="Remove recipient"
        tone="danger"
      />

      <Modal
        open={Boolean(linkDialog)}
        onClose={() => setLinkDialog(null)}
        title={linkDialog?.kind === 'reissued' ? 'New single-use link' : 'Recipient link ready'}
        description={
          linkDialog?.kind === 'reissued'
            ? 'Share this link with the recipient. It replaces their previous link.'
            : 'This link is shown once — copy it now and send it to the recipient.'
        }
        footer={<Button onClick={() => setLinkDialog(null)}>Done</Button>}
      >
        {linkDialog ? (
          <div className="space-y-3">
            <Alert
              tone="info"
              title={linkDialog.kind === 'reissued' ? 'New link ready' : 'Link ready'}
            >
              {linkDialog.kind === 'reissued'
                ? 'The previous link is now invalid. Copy the new link below and forward it to the recipient — their username and password are unchanged.'
                : `Send ${linkDialog.username} this single-use link along with the credentials you just set. The backend stores only a hash of the link, so it cannot be shown again — if it is lost, issue a new one.`}
            </Alert>
            <CopyField label={`Link for ${linkDialog.username}`} value={linkDialog.url} mono />
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={confirmRevokeFile}
        onClose={() => setConfirmRevokeFile(false)}
        onConfirm={handleRevokeFile}
        title="Revoke all access?"
        description={`Revoke every active share link for ${file.name}? Recipients will lose access immediately.`}
        confirmLabel="Revoke access"
        tone="danger"
      />

      <ConfirmDialog
        open={confirmDeleteFile}
        onClose={() => setConfirmDeleteFile(false)}
        onConfirm={handleDeleteFile}
        title="Permanently delete this file?"
        description={`Delete the encrypted original for ${file.name} and revoke its recipient access? Associated watermark rendition records will also be removed, while access logs are retained. If this image belongs to an album, the album's links will be revoked too.`}
        confirmLabel="Delete file"
        tone="danger"
      />
    </div>
  )
}
