import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'

import { useToast, type ToastTone } from '@/context/ToastContext'
import { cn } from '@/utils/cn'

const TONES: Record<ToastTone, { icon: typeof Info; ring: string; accent: string }> = {
  success: { icon: CheckCircle2, ring: 'ring-success-200', accent: 'text-success-600' },
  error: { icon: XCircle, ring: 'ring-danger-200', accent: 'text-danger-600' },
  warning: { icon: AlertTriangle, ring: 'ring-warning-200', accent: 'text-warning-600' },
  info: { icon: Info, ring: 'ring-info-100', accent: 'text-info-600' },
}

/** Global toast viewport. Mount once, inside <ToastProvider>. */
export function Toaster() {
  const { toasts, dismiss } = useToast()

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      role="region"
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
    >
      {toasts.map((toast) => {
        const { icon: Icon, ring, accent } = TONES[toast.tone]
        return (
          <div
            key={toast.id}
            role="status"
            className={cn(
              'pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-xl bg-surface p-3.5 shadow-pop ring-1',
              ring,
            )}
          >
            <Icon size={18} className={cn('mt-0.5 shrink-0', accent)} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-ink">{toast.title}</p>
              {toast.description ? (
                <p className="mt-0.5 text-[12.5px] leading-5 text-ink-muted">{toast.description}</p>
              ) : null}
              {toast.action ? (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick()
                    dismiss(toast.id)
                  }}
                  className="mt-2 text-[12.5px] font-semibold text-brand-600 hover:text-brand-700"
                >
                  {toast.action.label}
                </button>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismiss(toast.id)}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-navy-900/5 hover:text-ink"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>,
    document.body,
  )
}
