import { forwardRef, useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff, Search, X } from 'lucide-react'

import { Field, useFieldId } from '@/components/common/Field'
import { cn } from '@/utils/cn'

export const controlClass = cn(
  'w-full rounded-lg border bg-surface text-sm text-ink placeholder:text-ink-muted/80',
  'transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none',
  'disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-ink-muted',
)

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string | null
  leftIcon?: React.ReactNode
  rightSlot?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leftIcon, rightSlot, className, id, ...props },
  ref,
) {
  const fieldId = useFieldId(id)
  const hasError = Boolean(error)

  return (
    <Field label={label} hint={hint} error={error} required={props.required} htmlFor={fieldId}>
      <div className="relative">
        {leftIcon ? (
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted">
            {leftIcon}
          </span>
        ) : null}
        <input
          ref={ref}
          id={fieldId}
          aria-invalid={hasError || undefined}
          className={cn(
            controlClass,
            'h-9 px-3',
            leftIcon && 'pl-9',
            rightSlot && 'pr-9',
            hasError && 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/25',
            className,
          )}
          {...props}
        />
        {rightSlot ? (
          <span className="absolute top-1/2 right-2 -translate-y-1/2">{rightSlot}</span>
        ) : null}
      </div>
    </Field>
  )
})

export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type'>>(
  function PasswordInput(props, ref) {
    const [visible, setVisible] = useState(false)
    return (
      <Input
        ref={ref}
        type={visible ? 'text' : 'password'}
        rightSlot={
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            className="flex size-7 items-center justify-center rounded-md text-ink-muted hover:bg-navy-900/5 hover:text-ink"
          >
            {visible ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        }
        {...props}
      />
    )
  },
)

export interface SearchInputProps extends Omit<InputProps, 'leftIcon' | 'rightSlot'> {
  onClear?: () => void
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onClear, className, placeholder = 'Search…', ...props },
  ref,
) {
  const hasValue = typeof value === 'string' && value.length > 0
  return (
    <Input
      ref={ref}
      value={value}
      placeholder={placeholder}
      leftIcon={<Search size={15} />}
      rightSlot={
        hasValue && onClear ? (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search"
            className="flex size-7 items-center justify-center rounded-md text-ink-muted hover:bg-navy-900/5 hover:text-ink"
          >
            <X size={15} />
          </button>
        ) : undefined
      }
      className={className}
      {...props}
    />
  )
})
