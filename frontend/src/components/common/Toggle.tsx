import { forwardRef, useId, type InputHTMLAttributes } from 'react'
import { Check } from 'lucide-react'

import { cn } from '@/utils/cn'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  description?: string
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, className, id, ...props },
  ref,
) {
  const generated = useId()
  const fieldId = id ?? generated

  return (
    <label
      htmlFor={fieldId}
      className={cn(
        'group flex cursor-pointer items-start gap-2.5 select-none',
        props.disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <span className="relative mt-0.5 flex size-4 shrink-0 items-center justify-center">
        <input
          ref={ref}
          id={fieldId}
          type="checkbox"
          className="peer size-4 cursor-pointer appearance-none rounded-[5px] border border-line-strong bg-surface transition-colors checked:border-brand-600 checked:bg-brand-600 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none disabled:cursor-not-allowed"
          {...props}
        />
        <Check
          aria-hidden
          size={11}
          strokeWidth={3}
          className="pointer-events-none absolute text-white opacity-0 peer-checked:opacity-100"
        />
      </span>
      {label || description ? (
        <span className="flex flex-col">
          {label ? <span className="text-[13px] leading-5 text-ink">{label}</span> : null}
          {description ? (
            <span className="text-[12px] leading-4 text-ink-muted">{description}</span>
          ) : null}
        </span>
      ) : null}
    </label>
  )
})

export interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label?: string
  description?: string
  disabled?: boolean
  /** Set when the switch is locked on by a backend policy. */
  locked?: boolean
  className?: string
  name?: string
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  locked,
  className,
  name,
}: SwitchProps) {
  const isDisabled = disabled || locked
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      {label || description ? (
        <span className="flex min-w-0 flex-col">
          <span className="text-[13px] leading-5 font-medium text-ink">{label}</span>
          {description ? (
            <span className="mt-0.5 text-[12px] leading-4 text-ink-muted">{description}</span>
          ) : null}
        </span>
      ) : null}
      <button
        type="button"
        role="switch"
        name={name}
        aria-checked={checked}
        aria-label={label}
        disabled={isDisabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
          'focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none',
          checked ? 'bg-brand-600' : 'bg-slate-300',
          isDisabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <span
          className={cn(
            'pointer-events-none absolute size-3.5 rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-[19px]' : 'translate-x-[3px]',
          )}
        />
      </button>
    </div>
  )
}
