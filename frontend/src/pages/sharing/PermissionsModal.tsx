import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'

import { Alert, Badge, Button, Modal } from '@/components/common'
import { RecipientPermissionsFields, permissionChipLabels } from '@/components/files'
import { useToast } from '@/context/ToastContext'
import { toApiError } from '@/services'
import { sharesService } from '@/services/shares.service'
import { createDefaultPermissions } from '@/utils/policy'
import type { RecipientPermissions, ShareLink } from '@/types'

export interface PermissionsModalProps {
  share: ShareLink | null
  onClose: () => void
  /** Called after a successful save so the caller can refresh its list. */
  onSaved?: () => void
}

/**
 * Recipient permission editor for a share link.
 *
 * The fixed access rules — view-only, the single-use link and the single
 * authorized session — can never be changed. Only the per-recipient tunables
 * (session duration, link expiry) are editable, and they are persisted via
 * `PATCH /shares/{id}/permissions/`.
 */
export function PermissionsModal({ share, onClose, onSaved }: PermissionsModalProps) {
  const toast = useToast()
  const [permissions, setPermissions] = useState<RecipientPermissions>(createDefaultPermissions)
  const [saving, setSaving] = useState(false)
  const [seededShareId, setSeededShareId] = useState<string | null>(null)

  /* Re-seed the controls whenever a different share is opened. */
  if (share && share.id !== seededShareId) {
    setSeededShareId(share.id)
    setPermissions(share.permissions ?? createDefaultPermissions())
  }

  const handleSave = async () => {
    if (!share) return
    setSaving(true)
    try {
      await sharesService.updatePermissions(share.id, {
        sessionDurationMinutes: permissions.sessionDurationMinutes,
        expiresAt: permissions.expiresAt,
      })
      toast.success(
        'Permissions updated',
        `${share.recipientUsername} now has the new access window.`,
      )
      onSaved?.()
      onClose()
    } catch (failure) {
      toast.error('Could not update permissions', toApiError(failure).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={Boolean(share)}
      onClose={onClose}
      title="Recipient permissions"
      description={share ? `${share.recipientUsername} · ${share.fileName}` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={handleSave} loading={saving}>
            Save permissions
          </Button>
        </>
      }
    >
      {share ? (
        <div className="space-y-4">
          <Alert
            tone="info"
            icon={<ShieldCheck size={16} />}
            title="Access is fixed; the window is tunable"
          >
            View-only access, the single-use link and the single authorized session are enforced
            server-side and cannot be changed. You can adjust the session duration and the link's
            expiry below.
          </Alert>

          <div className="space-y-2">
            <p className="text-[11.5px] font-medium tracking-wide text-ink-muted uppercase">
              Permission summary
            </p>
            <div className="flex flex-wrap gap-1.5">
              {permissionChipLabels(permissions).map((chip) => (
                <Badge key={chip} tone="neutral" size="sm">
                  {chip}
                </Badge>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-line px-4">
            <RecipientPermissionsFields permissions={permissions} onChange={setPermissions} />
          </div>
        </div>
      ) : null}
    </Modal>
  )
}
