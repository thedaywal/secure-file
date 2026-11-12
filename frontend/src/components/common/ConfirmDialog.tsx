import { useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

import { Button } from '@/components/common/Button'
import { Modal } from '@/components/common/Modal'
import { cn } from '@/utils/cn'

export type ConfirmTone = 'danger' | 'warning' | 'primary'

const TONE_RING: Record<ConfirmTone, string> = {
  danger: 'bg-danger-50 text-danger-600',
  warning: 'bg-warning-50 text-warning-600',
  primary: 'bg-brand-50 text-brand-600',
}

export interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: ConfirmTone
  /** Extra content rendered between the description and the actions. */
  children?: ReactNode
}

/**
 * Confirmation gate for destructive or irreversible actions
 * (revoking access, deleting a file, revoking a device…).
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  children,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)

  const handleConfirm = async () => {
    setBusy(true)
    try {
      await onConfirm()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      dismissible={!busy}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={handleConfirm}
            loading={busy}
            data-autofocus
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3.5">
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-full',
            TONE_RING[tone],
          )}
        >
          <AlertTriangle size={18} />
        </span>
        <div className="min-w-0 space-y-2">
          <h3 className="text-[14.5px] font-semibold text-ink">{title}</h3>
          {description ? (
            <div className="text-[13px] leading-relaxed text-ink-soft">{description}</div>
          ) : null}
          {children}
        </div>
      </div>
    </Modal>
  )
}
