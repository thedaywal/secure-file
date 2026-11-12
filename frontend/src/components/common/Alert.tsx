import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, X } from 'lucide-react'

import { cn } from '@/utils/cn'
import type { ToneIntent } from '@/utils/labels'

const ALERT_TONES: Record<
  Exclude<ToneIntent, 'neutral' | 'brand'>,
  { wrap: string; icon: typeof Info; iconClass: string }
> = {
  info: { wrap: 'border-info-100 bg-info-50/70 text-info-700', icon: Info, iconClass: 'text-info-600' },
  success: {
    wrap: 'border-success-200 bg-success-50/70 text-success-700',
    icon: CheckCircle2,
    iconClass: 'text-success-600',
  },
  warning: {
    wrap: 'border-warning-200 bg-warning-50/80 text-warning-700',
    icon: AlertTriangle,
    iconClass: 'text-warning-600',
  },
  danger: {
    wrap: 'border-danger-200 bg-danger-50/70 text-danger-700',
    icon: ShieldAlert,
    iconClass: 'text-danger-600',
  },
}

export interface AlertProps {
  tone?: 'info' | 'success' | 'warning' | 'danger'
  title?: ReactNode
  children?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  onDismiss?: () => void
  className?: string
}

export function Alert({
  tone = 'info',
  title,
  children,
  icon,
  actions,
  onDismiss,
  className,
}: AlertProps) {
  const config = ALERT_TONES[tone]
  const Icon = config.icon
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-lg border px-3.5 py-3', config.wrap, className)}
    >
      <span className={cn('mt-0.5 shrink-0', config.iconClass)}>
        {icon ?? <Icon size={16} />}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        {title ? <p className="text-[13px] font-semibold">{title}</p> : null}
        {children ? <div className="text-[12.5px] leading-5">{children}</div> : null}
        {actions ? <div className="flex flex-wrap gap-2 pt-1">{actions}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          className="shrink-0 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100"
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  )
}
