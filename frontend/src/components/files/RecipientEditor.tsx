import { useEffect, useState } from 'react'
import { Ban, KeyRound, Pencil, RefreshCw, Trash2 } from 'lucide-react'

import { Avatar, Badge, Button, IconButton, Input, Modal, PasswordInput } from '@/components/common'
import { LinkStateBadge } from '@/components/security/SecurityBadges'
import { formatDate, formatUntil } from '@/utils/format'
import {
  createDefaultPermissions,
  validateRecipientPassword,
  validateUsername,
} from '@/utils/policy'
import type { LinkState, Recipient, RecipientPermissions, ShareLink } from '@/types'

/* ------------------------------------------------------------------ *
 * Drafts — the wizard keeps editable recipient drafts in local state.
 * ------------------------------------------------------------------ */
export interface RecipientDraft {
  id: string
  /** Image-specific credential username chosen by the administrator. */
  username: string
  /** Initial password; only ever sent to the backend, never persisted. */
  password: string
  displayName: string
  permissions: RecipientPermissions
}

function draftId(): string {
  return `rcp_draft_${Math.random().toString(36).slice(2, 10)}`
}

export function createRecipientDraft(init: Partial<Omit<RecipientDraft, 'id'>> = {}): RecipientDraft {
  return {
    id: draftId(),
    username: init.username ?? '',
    password: init.password ?? '',
    displayName: init.displayName ?? '',
    permissions: init.permissions ?? createDefaultPermissions(),
  }
}

export function permissionChipLabels(permissions: RecipientPermissions): string[] {
  const chips: string[] = ['View only']
  chips.push(`Session ${permissions.sessionDurationMinutes} min`)
  chips.push(permissions.expiresAt ? `Expires ${formatUntil(permissions.expiresAt)}` : 'No expiry')
  return chips
}

/**
 * The recipients tab is backed by the shares endpoint; each share carries the
 * recipient identity and its permission summary, so we project it into the
 * `Recipient` shape the UI uses.
 */
export function recipientFromShare(share: ShareLink): Recipient {
  return {
    id: share.recipientId,
    username: share.recipientUsername,
    fileId: share.fileId,
    fileName: share.fileName,
    permissions: share.permissions ?? createDefaultPermissions(),
    status: share.state,
    createdAt: share.createdAt,
    lastAuthenticatedAt: share.consumedAt ?? null,
  }
}

function PermissionChips({ permissions }: { permissions: RecipientPermissions }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {permissionChipLabels(permissions).map((chip) => (
        <Badge key={chip} tone="neutral" size="sm">
          {chip}
        </Badge>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Permission controls — shared by every recipient editor surface.
 * ------------------------------------------------------------------ */
export interface RecipientPermissionsFieldsProps {
  permissions: RecipientPermissions
  onChange: (permissions: RecipientPermissions) => void
}

export function RecipientPermissionsFields({
  permissions,
  onChange,
}: RecipientPermissionsFieldsProps) {
  const update = (patch: Partial<RecipientPermissions>) => onChange({ ...permissions, ...patch })

  return (
    <div className="space-y-3.5">
      <div className="rounded-lg border border-line bg-surface-subtle/60 px-3.5 py-3">
        <p className="text-[12px] text-ink-muted">Allowed action</p>
        <p className="mt-0.5 text-[13px] font-medium text-ink">
          View the watermarked image in the protected viewer
        </p>
      </div>

      <Input
        className="max-w-[220px]"
        type="number"
        min={1}
        label="Session duration (minutes)"
        value={String(permissions.sessionDurationMinutes)}
        onChange={(event) =>
          update({ sessionDurationMinutes: Math.max(1, Number(event.target.value) || 1) })
        }
      />

      <div>
        <label className="flex items-center gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            className="size-4 rounded border-line-strong"
            checked={permissions.expiresAt !== null}
            onChange={(event) =>
              update({
                expiresAt: event.target.checked
                  ? new Date(Date.now() + 14 * 86_400_000).toISOString()
                  : null,
              })
            }
          />
          Set a link expiration date
        </label>
        {permissions.expiresAt !== null ? (
          <Input
            className="mt-3 max-w-[260px]"
            type="datetime-local"
            label="Link expires at"
            value={new Date(permissions.expiresAt).toISOString().slice(0, 16)}
            onChange={(event) =>
              update({
                expiresAt: event.target.value
                  ? new Date(event.target.value).toISOString()
                  : null,
              })
            }
          />
        ) : null}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Add / edit recipient modal.
 * ------------------------------------------------------------------ */
export interface RecipientFormValues {
  username: string
  password: string
  displayName: string
  permissions: RecipientPermissions
}

export interface RecipientFormModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  submitLabel?: string
  initial?: Partial<RecipientFormValues>
  /** Locks the username field when editing an existing recipient. */
  lockUsername?: boolean
  submitError?: string | null
  onSubmit: (values: RecipientFormValues) => void
}

export function RecipientFormModal({
  open,
  onClose,
  title,
  description,
  submitLabel = 'Save recipient',
  initial,
  lockUsername,
  submitError,
  onSubmit,
}: RecipientFormModalProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [permissions, setPermissions] = useState<RecipientPermissions>(createDefaultPermissions())
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setUsername(initial?.username ?? '')
    setPassword(initial?.password ?? '')
    setDisplayName(initial?.displayName ?? '')
    setPermissions(initial?.permissions ?? createDefaultPermissions())
    setUsernameError(null)
    setPasswordError(null)
    // Seed only when the modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleSubmit = () => {
    const usernameProblem = validateUsername(username)
    const passwordProblem = validateRecipientPassword(password)
    setUsernameError(usernameProblem)
    setPasswordError(passwordProblem)
    if (usernameProblem || passwordProblem) return
    onSubmit({
      username: username.trim(),
      password,
      displayName: displayName.trim(),
      permissions,
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>{submitLabel}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {submitError ? (
          <p className="rounded-lg bg-danger-50 px-3 py-2 text-[12.5px] text-danger-700">
            {submitError}
          </p>
        ) : null}
        <Input
          label="Recipient username"
          type="text"
          inputMode="numeric"
          maxLength={10}
          placeholder="10-digit username"
          value={username}
          disabled={lockUsername}
          onChange={(event) => {
            setUsername(event.target.value.replace(/\D/g, '').slice(0, 10))
            setUsernameError(null)
          }}
          error={usernameError}
          hint="Exactly 10 digits. This image-specific ID is embedded in the recipient's watermark."
          required
        />
        <Input
          label="Display name (optional)"
          placeholder="Amara Okafor"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          hint="Shown only in this console — never to the recipient."
        />
        {lockUsername ? null : (
          <PasswordInput
            label="Initial password"
            inputMode="numeric"
            maxLength={10}
            placeholder="10-digit password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value.replace(/\D/g, '').slice(0, 10))
              setPasswordError(null)
            }}
            error={passwordError}
            hint="Exactly 10 digits. The backend hashes it with Argon2 and never stores it in plaintext."
            required
          />
        )}
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink">Permissions</p>
          <RecipientPermissionsFields permissions={permissions} onChange={setPermissions} />
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ *
 * Recipient row — used by the file detail recipients tab.
 * ------------------------------------------------------------------ */
export interface RecipientRowProps {
  recipient: Recipient
  onEdit: (recipient: Recipient) => void
  onReissue: (recipient: Recipient) => void
  onRevoke: (recipient: Recipient) => void
  onRemove: (recipient: Recipient) => void
}

function labelOf(recipient: Recipient): string {
  return recipient.displayName || recipient.username
}

export function RecipientRow({ recipient, onEdit, onReissue, onRevoke, onRemove }: RecipientRowProps) {
  const consumed: LinkState = recipient.status
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <Avatar name={labelOf(recipient)} size="md" />
        <div className="min-w-0 space-y-2">
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-medium text-ink">{labelOf(recipient)}</p>
            <p className="flex items-center gap-1 truncate font-mono text-[12px] text-ink-muted">
              <KeyRound size={12} aria-hidden />
              {recipient.username}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <LinkStateBadge state={consumed} />
            <span className="text-[11.5px] text-ink-muted">
              Added {formatDate(recipient.createdAt)}
            </span>
          </div>
          <PermissionChips permissions={recipient.permissions} />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:pt-0.5">
        <Button
          variant="outline"
          size="sm"
          leftIcon={<Pencil size={14} />}
          onClick={() => onEdit(recipient)}
        >
          Edit
        </Button>
        <IconButton
          label="Reissue access link"
          size="sm"
          variant="ghost"
          onClick={() => onReissue(recipient)}
        >
          <RefreshCw size={15} />
        </IconButton>
        <IconButton
          label="Revoke access"
          size="sm"
          variant="ghost"
          className="text-danger-600 hover:bg-danger-50"
          onClick={() => onRevoke(recipient)}
        >
          <Ban size={15} />
        </IconButton>
        <IconButton
          label="Remove recipient"
          size="sm"
          variant="ghost"
          className="text-danger-600 hover:bg-danger-50"
          onClick={() => onRemove(recipient)}
        >
          <Trash2 size={15} />
        </IconButton>
      </div>
    </div>
  )
}
