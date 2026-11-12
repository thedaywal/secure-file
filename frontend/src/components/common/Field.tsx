import { useId, type ReactNode } from 'react'

import { cn } from '@/utils/cn'

export interface FieldProps {
  label?: ReactNode
  hint?: ReactNode
  error?: string | null
  required?: boolean
  htmlFor?: string
  className?: string
  /** Renders the label/hint/error chrome inline for compact toolbars. */
  children: ReactNode
}

/**
 * Shared label / hint / error scaffold so every control has identical
 * spacing, typography and accessibility wiring.
 */
export function Field({ label, hint, error, required, htmlFor, className, children }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <label
          htmlFor={htmlFor}
          className="text-[13px] font-medium text-ink select-none"
        >
          {label}
          {required ? <span className="ml-0.5 text-danger-600">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p role="alert" className="text-[12px] text-danger-600">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12px] text-ink-muted">{hint}</p>
      ) : null}
    </div>
  )
}

/** Generates a stable id when a consumer does not supply one. */
export function useFieldId(providedId?: string): string {
  const generated = useId()
  return providedId ?? generated
}
