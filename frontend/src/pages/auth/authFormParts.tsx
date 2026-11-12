import type { ReactNode } from 'react'

import { Alert, Progress } from '@/components/common'
import type { ApiError } from '@/types'

/** Minimum password length enforced client-side (the backend re-validates). */
export const PASSWORD_MIN_LENGTH = 10

/** Cooldown applied to "resend code" / "resend email" controls. */
export const RESEND_COOLDOWN_SECONDS = 60

export interface AuthCardProps {
  title: string
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

/** Compact heading + supporting line shared by every authentication screen. */
export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="text-[13px] leading-5 text-ink-muted">{subtitle}</p> : null}
      </header>

      {children}

      {footer ? (
        <div className="border-t border-line pt-4 text-center text-[13px] text-ink-muted">
          {footer}
        </div>
      ) : null}
    </div>
  )
}

export interface FormErrorProps {
  error?: ApiError | null
  /** Overrides the message derived from `error`. */
  message?: string | null
  title?: string
}

/** Form-level failure surface. Renders nothing when there is no message. */
export function FormError({ error, message, title = 'We could not complete that request' }: FormErrorProps) {
  const text = message ?? error?.message
  if (!text) return null
  return (
    <Alert tone="danger" title={title}>
      {text}
    </Alert>
  )
}

/**
 * Simple 0–4 password score based on length, mixed case, digits and symbols.
 * This is a UX affordance only; the backend owns password policy enforcement.
 */
export function scorePassword(password: string): number {
  let score = 0
  if (password.length >= PASSWORD_MIN_LENGTH) score += 1
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1
  if (/\d/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1
  return score
}

const STRENGTH_META: Record<
  number,
  { label: string; tone: 'danger' | 'warning' | 'brand' | 'success' }
> = {
  0: { label: 'Too weak', tone: 'danger' },
  1: { label: 'Weak', tone: 'danger' },
  2: { label: 'Fair', tone: 'warning' },
  3: { label: 'Strong', tone: 'brand' },
  4: { label: 'Very strong', tone: 'success' },
}

/** Strength meter driven by `scorePassword`. */
export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null
  const score = scorePassword(password)
  const meta = STRENGTH_META[score]
  return (
    <div className="space-y-1.5">
      <Progress value={score} max={4} tone={meta.tone} size="sm" label="Password strength" />
      <p className="text-[12px] text-ink-muted">
        Password strength: <span className="font-medium text-ink-soft">{meta.label}</span>
      </p>
    </div>
  )
}
