import { Check } from 'lucide-react'

import { cn } from '@/utils/cn'

export interface Step {
  id: string
  label: string
  description?: string
}

export interface StepperProps {
  steps: Step[]
  current: number
  onStepClick?: (index: number) => void
  orientation?: 'horizontal' | 'vertical'
  className?: string
}

export function Stepper({
  steps,
  current,
  onStepClick,
  orientation = 'horizontal',
  className,
}: StepperProps) {
  if (orientation === 'vertical') {
    return (
      <ol className={cn('flex flex-col', className)}>
        {steps.map((step, index) => {
          const state = index < current ? 'done' : index === current ? 'active' : 'upcoming'
          return (
            <li key={step.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <StepMarker index={index} state={state} />
                {index < steps.length - 1 ? (
                  <span
                    className={cn('my-1 w-px flex-1', state === 'done' ? 'bg-brand-400' : 'bg-line')}
                  />
                ) : null}
              </div>
              <div className={cn('pb-5', index === steps.length - 1 && 'pb-0')}>
                <p
                  className={cn(
                    'text-[13px] font-medium',
                    state === 'upcoming' ? 'text-ink-muted' : 'text-ink',
                  )}
                >
                  {step.label}
                </p>
                {step.description ? (
                  <p className="mt-0.5 text-[12px] text-ink-muted">{step.description}</p>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
    )
  }

  return (
    <ol className={cn('flex items-start gap-2', className)}>
      {steps.map((step, index) => {
        const state = index < current ? 'done' : index === current ? 'active' : 'upcoming'
        const clickable = Boolean(onStepClick) && index <= current
        return (
          <li key={step.id} className="flex min-w-0 flex-1 items-start gap-2">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => onStepClick?.(index)}
              className={cn(
                'flex min-w-0 items-center gap-2 text-left',
                clickable ? 'cursor-pointer' : 'cursor-default',
              )}
            >
              <StepMarker index={index} state={state} />
              <span className="min-w-0">
                <span
                  className={cn(
                    'block truncate text-[12.5px] font-medium',
                    state === 'upcoming' ? 'text-ink-muted' : 'text-ink',
                  )}
                >
                  {step.label}
                </span>
                {step.description ? (
                  <span className="hidden truncate text-[11.5px] text-ink-muted lg:block">
                    {step.description}
                  </span>
                ) : null}
              </span>
            </button>
            {index < steps.length - 1 ? (
              <span
                className={cn(
                  'mt-3.5 hidden h-px flex-1 sm:block',
                  state === 'done' ? 'bg-brand-400' : 'bg-line',
                )}
              />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

function StepMarker({ index, state }: { index: number; state: 'done' | 'active' | 'upcoming' }) {
  return (
    <span
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ring-1 transition-colors',
        state === 'done' && 'bg-brand-600 text-white ring-brand-600',
        state === 'active' && 'bg-surface text-brand-700 ring-brand-500 ring-2',
        state === 'upcoming' && 'bg-surface text-ink-muted ring-line',
      )}
    >
      {state === 'done' ? <Check size={14} strokeWidth={3} /> : index + 1}
    </span>
  )
}
