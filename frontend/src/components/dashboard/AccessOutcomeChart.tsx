import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import { ChartSkeleton } from '@/components/common'
import { formatCompact, percent } from '@/utils/format'
import type { DashboardSummary } from '@/types'

/** Successful / failed / blocked outcome split. Presentational: props in, no fetching. */
export interface AccessOutcomeChartProps {
  data: DashboardSummary['accessOutcome']
  loading?: boolean
}

type OutcomeTone = DashboardSummary['accessOutcome'][number]['tone']

const TONE_COLORS: Record<OutcomeTone, string> = {
  success: '#10b981',
  failed: '#ef4444',
  blocked: '#f59e0b',
}

interface TooltipEntry {
  name?: string | number
  value?: number | string
}

interface OutcomeTooltipProps {
  active?: boolean
  payload?: ReadonlyArray<TooltipEntry>
}

function OutcomeTooltip({ active, payload }: OutcomeTooltipProps) {
  const entry = payload?.[0]
  if (!active || !entry) return null
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[12px] shadow-pop">
      <span className="text-ink-soft">{entry.name}</span>
      <span className="ml-2 font-semibold text-ink tabular-nums">
        {formatCompact(Number(entry.value ?? 0))}
      </span>
    </div>
  )
}

export function AccessOutcomeChart({ data, loading }: AccessOutcomeChartProps) {
  if (loading) return <ChartSkeleton className="h-[280px]" />

  const total = data.reduce((sum, item) => sum + item.value, 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="relative mx-auto h-[220px] w-full max-w-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="86%"
              paddingAngle={2}
              stroke="none"
              animationDuration={320}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={TONE_COLORS[entry.tone]} />
              ))}
            </Pie>
            <Tooltip content={<OutcomeTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[24px] leading-8 font-semibold text-ink tabular-nums">
            {formatCompact(total)}
          </span>
          <span className="text-[11.5px] text-ink-muted">total attempts</span>
        </div>
      </div>

      <ul className="space-y-2">
        {data.map((entry) => (
          <li key={entry.name} className="flex items-center gap-2.5 text-[12.5px]">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: TONE_COLORS[entry.tone] }}
            />
            <span className="text-ink-soft">{entry.name}</span>
            <span className="ml-auto font-semibold text-ink tabular-nums">
              {formatCompact(entry.value)}
            </span>
            <span className="w-9 text-right text-ink-muted tabular-nums">
              {percent(entry.value, total)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
