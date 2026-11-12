import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

import { cn } from '@/utils/cn'

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'success'
  | 'link'

export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white shadow-card hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300',
  secondary:
    'bg-navy-900 text-white shadow-card hover:bg-navy-800 active:bg-navy-700 disabled:bg-navy-600',
  outline:
    'border border-line-strong bg-surface text-ink hover:border-brand-300 hover:bg-brand-50/60 active:bg-brand-50',
  ghost: 'text-ink-soft hover:bg-navy-900/5 hover:text-ink active:bg-navy-900/10',
  danger: 'bg-danger-600 text-white shadow-card hover:bg-danger-700 active:bg-danger-700',
  success: 'bg-success-600 text-white shadow-card hover:bg-success-700 active:bg-success-700',
  link: 'text-brand-600 underline-offset-4 hover:underline px-0',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-[13px]',
  md: 'h-9 gap-2 px-3.5 text-sm',
  lg: 'h-11 gap-2 px-5 text-sm',
}

const ICON_SIZES: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18 }

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  fullWidth?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth,
    className,
    children,
    disabled,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition-colors',
        'focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        variant === 'link' ? '' : SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? (
        <Loader2 aria-hidden className="animate-spin" size={ICON_SIZES[size]} />
      ) : (
        leftIcon
      )}
      {children}
      {!loading && rightIcon}
    </button>
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Exclude<ButtonVariant, 'link'>
  size?: ButtonSize
  label: string
  loading?: boolean
}

const ICON_BOX: Record<ButtonSize, string> = {
  sm: 'size-8',
  md: 'size-9',
  lg: 'size-11',
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'ghost', size = 'md', label, loading, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-lg transition-colors',
        'focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        ICON_BOX[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 aria-hidden className="animate-spin" size={16} /> : children}
    </button>
  )
})
