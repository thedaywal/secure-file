import { cn } from '@/utils/cn'
import { initials } from '@/utils/format'

const SIZES = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-[11px]',
  md: 'size-10 text-[13px]',
  lg: 'size-12 text-[15px]',
} as const

const PALETTE = [
  'bg-brand-100 text-brand-700',
  'bg-success-100 text-success-700',
  'bg-warning-100 text-warning-700',
  'bg-info-100 text-info-700',
  'bg-danger-100 text-danger-700',
  'bg-navy-700 text-white',
]

export interface AvatarProps {
  name: string
  src?: string
  size?: keyof typeof SIZES
  className?: string
  /** Deterministic colour selection derived from the name. */
  tone?: number
}

export function Avatar({ name, src, size = 'sm', className, tone }: AvatarProps) {
  const hash =
    tone ?? [...name].reduce((accumulator, character) => accumulator + character.charCodeAt(0), 0)
  const palette = PALETTE[hash % PALETTE.length]

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn('shrink-0 rounded-full object-cover', SIZES[size], className)}
      />
    )
  }

  return (
    <span
      aria-hidden
      title={name}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none',
        SIZES[size],
        palette,
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
