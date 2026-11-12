import { cn } from '@/utils/cn'
import { clamp } from '@/utils/format'

export interface ProgressProps {
  value: number
  max?: number
  tone?: 'brand' | 'success' | 'warning' | 'danger'
  size?: 'sm' | 'md'
  label?: string
  showValue?: boolean
  className?: string
}

const TONE_CLASSES = {
  brand: 'bg-brand-600',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
}

export function Progress({
  value,
  max = 100,
  tone = 'brand',
  size = 'md',
  label,
  showValue,
  className,
}: ProgressProps) {
  const percentage = clamp(max === 0 ? 0 : (value / max) * 100, 0, 100)

  return (
    <div className={cn('w-full', className)}>
      {label || showValue ? (
        <div className="mb-1.5 flex items-center justify-between text-[12px]">
          {label ? <span className="text-ink-muted">{label}</span> : <span />}
          {showValue ? <span className="font-medium text-ink-soft">{Math.round(percentage)}%</span> : null}
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuenow={Math.round(percentage)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className={cn(
          'w-full overflow-hidden rounded-full bg-navy-900/8',
          size === 'sm' ? 'h-1.5' : 'h-2',
        )}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-300', TONE_CLASSES[tone])}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

export interface SliderProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  label?: string
  formatValue?: (value: number) => string
  hint?: string
  disabled?: boolean
  id?: string
  className?: string
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  formatValue,
  hint,
  disabled,
  id,
  className,
}: SliderProps) {
  return (
    <div className={cn('w-full', className)}>
      {label ? (
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor={id} className="text-[13px] font-medium text-ink">
            {label}
          </label>
          <span className="rounded bg-surface-subtle px-2 py-0.5 font-mono text-[12px] text-ink-soft tabular-nums">
            {formatValue ? formatValue(value) : value}
          </span>
        </div>
      ) : null}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-navy-900/10 accent-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
      />
      {hint ? <p className="mt-1.5 text-[12px] text-ink-muted">{hint}</p> : null}
    </div>
  )
}
