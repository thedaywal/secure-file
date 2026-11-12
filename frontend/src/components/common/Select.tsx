import { forwardRef, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'

import { controlClass } from '@/components/common/Input'
import { Field, useFieldId } from '@/components/common/Field'
import { cn } from '@/utils/cn'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  hint?: string
  error?: string | null
  options: SelectOption[]
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, options, placeholder, className, id, ...props },
  ref,
) {
  const fieldId = useFieldId(id)
  return (
    <Field label={label} hint={hint} error={error} required={props.required} htmlFor={fieldId}>
      <div className="relative">
        <select
          ref={ref}
          id={fieldId}
          aria-invalid={Boolean(error) || undefined}
          className={cn(
            controlClass,
            'h-9 cursor-pointer appearance-none pr-9 pl-3',
            error && 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/25',
            className,
          )}
          {...props}
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          size={15}
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-muted"
        />
      </div>
    </Field>
  )
})

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string | null
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, id, rows = 4, ...props },
  ref,
) {
  const fieldId = useFieldId(id)
  return (
    <Field label={label} hint={hint} error={error} required={props.required} htmlFor={fieldId}>
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        aria-invalid={Boolean(error) || undefined}
        className={cn(
          controlClass,
          'resize-y px-3 py-2 leading-relaxed',
          error && 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/25',
          className,
        )}
        {...props}
      />
    </Field>
  )
})
