import type { ReactNode } from 'react'
import { Clock, FileImage, ShieldCheck, Stamp } from 'lucide-react'

import {
  Badge,
  Card,
  CardBody,
  CardFooter,
  CopyField,
  InfoList,
  InfoRow,
} from '@/components/common'
import { cn } from '@/utils/cn'
import { formatDateTime, formatDuration, formatUntil } from '@/utils/format'
import type { ViewerLinkContext, ViewerSession } from '@/types'

/* ------------------------------------------------------------------ *
 * Full-screen state surface — used for expired / revoked / consumed /
 * denied / session-ended / error so every terminal state looks deliberate.
 * ------------------------------------------------------------------ */
const STATE_TONE = {
  danger: 'bg-danger-50 text-danger-600 ring-1 ring-danger-100',
  warning: 'bg-warning-50 text-warning-600 ring-1 ring-warning-100',
  neutral: 'bg-surface-subtle text-ink-muted ring-1 ring-line',
} as const

export interface StatePanelProps {
  icon: ReactNode
  tone?: keyof typeof STATE_TONE
  title: string
  description: ReactNode
  details?: ReactNode
  actions?: ReactNode
  hint?: ReactNode
}

export function StatePanel({
  icon,
  tone = 'neutral',
  title,
  description,
  details,
  actions,
  hint,
}: StatePanelProps) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 animate-fade-in flex-col items-center justify-center px-4 py-12 text-center sm:px-6">
      <span className={cn('flex size-14 items-center justify-center rounded-2xl', STATE_TONE[tone])}>
        {icon}
      </span>
      <h1 className="mt-5 text-lg font-semibold text-ink">{title}</h1>
      <p className="mt-2 max-w-md text-[13px] leading-5 text-ink-muted">{description}</p>
      {details ? <div className="mt-5 w-full max-w-sm text-left">{details}</div> : null}
      {actions ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">{actions}</div>
      ) : null}
      <p className="mt-6 flex items-center justify-center gap-1.5 text-[11.5px] leading-4 text-ink-muted">
        <Stamp size={13} className="shrink-0" />
        {hint ?? 'Contact the person who shared this image if you believe this is a mistake.'}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Centered card shell for the interactive credentials step.
 * ------------------------------------------------------------------ */
export interface ViewerCardProps {
  icon: ReactNode
  title: string
  subtitle?: ReactNode
  badge?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

export function ViewerCard({ icon, title, subtitle, badge, children, footer }: ViewerCardProps) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 animate-slide-up flex-col justify-center px-4 py-8 sm:px-6 sm:py-12">
      <Card className="overflow-hidden">
        <div className="flex items-start gap-3 border-b border-line bg-surface-subtle/60 px-5 py-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[15px] leading-6 font-semibold text-ink">{title}</h1>
              {badge}
            </div>
            {subtitle ? (
              <p className="mt-0.5 text-[12.5px] leading-5 text-ink-muted">{subtitle}</p>
            ) : null}
          </div>
        </div>
        <CardBody className="space-y-5">{children}</CardBody>
        {footer ? (
          <CardFooter className="text-[11.5px] leading-4 text-ink-muted">{footer}</CardFooter>
        ) : null}
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Compact share summary shown before the recipient authenticates.
 * ------------------------------------------------------------------ */
export function LinkSummary({ context }: { context: ViewerLinkContext }) {
  return (
    <div className="rounded-lg border border-line bg-surface-subtle/70 p-3.5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface text-ink-soft ring-1 ring-line">
          <FileImage size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-ink">{context.fileName}</p>
          <p className="mt-0.5 truncate text-[11.5px] text-ink-muted">
            Shared by {context.ownerName}
            {context.organization ? ` · ${context.organization}` : ''}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge tone="brand" size="sm">
          {context.extension} image
        </Badge>
        <Badge tone="neutral" size="sm">
          Single-use link
        </Badge>
        <Badge tone="neutral" size="sm">
          One session only
        </Badge>
      </div>

      {context.expiresAt ? (
        <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-ink-muted">
          <Clock size={12} className="shrink-0" />
          Link expires {formatUntil(context.expiresAt)}
        </p>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Session summary panel rendered alongside the watermarked rendition.
 * ------------------------------------------------------------------ */
export interface SessionPanelProps {
  session: ViewerSession
  remainingSeconds: number
}

export function SessionPanel({ session, remainingSeconds }: SessionPanelProps) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={15} className="text-success-600" />
          <p className="text-[13px] font-semibold text-ink">Authorized session</p>
        </div>
        <Badge tone="success" size="sm" dot>
          Live
        </Badge>
      </div>

      <CardBody className="space-y-4">
        <CopyField
          label="Access ID"
          value={session.accessId}
          mono
          hint="Quote this ID if you need to reference this access."
        />

        <InfoList>
          <InfoRow label="Recipient" value={session.recipientUsername} mono />
          <InfoRow
            label="Session expires in"
            value={
              <span className="inline-flex items-center gap-1.5">
                <Clock size={12} className="text-ink-muted" />
                {formatDuration(remainingSeconds)}
              </span>
            }
          />
          <InfoRow label="Opened" value={formatDateTime(session.startedAt)} />
          <InfoRow
            label="Delivery"
            value={
              <Badge tone="danger" size="sm">
                View only
              </Badge>
            }
          />
        </InfoList>
      </CardBody>

      <CardFooter className="text-[11.5px] leading-4 text-ink-muted">
        Downloads and printing are disabled for this delivery. Only one authorized session exists
        for this link.
      </CardFooter>
    </Card>
  )
}
