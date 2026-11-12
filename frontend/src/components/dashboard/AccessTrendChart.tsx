import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { ChartSkeleton } from '@/components/common'
import { formatCompact, formatShortDate } from '@/utils/format'
import type { AccessActivityPoint } from '@/types'

/** Successful / failed access volume over time. Presentational: props in, no fetching. */
export interface AccessTrendChartProps {
  data: AccessActivityPoint[]
  loading?: boolean
}

interface TrendSeries {
  key: 'successful' | 'failed'
  label: string
  color: string
  gradientId: string
}

const SERIES: TrendSeries[] = [
  { key: 'successful', label: 'Successful', color: '#10b981', gradientId: 'trendSuccess' },
  { key: 'failed', label: 'Failed', color: '#ef4444', gradientId: 'trendFailed' },
]

interface TooltipEntry {
  dataKey?: string | number
  name?: string | number
  value?: number | string
  color?: string
}

interface TrendTooltipProps {
  active?: boolean
  payload?: ReadonlyArray<TooltipEntry>
  label?: string | number
}

function TrendTooltip({ active, payload, label }: TrendTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 shadow-pop">
      <p className="mb-1.5 text-[11.5px] font-medium text-ink-muted">{formatShortDate(label)}</p>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={String(entry.dataKey)} className="flex items-center gap-2 text-[12px]">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color ?? '#7c8798' }}
            />
            <span className="text-ink-soft">{entry.name}</span>
            <span className="ml-3 font-semibold text-ink tabular-nums">
              {formatCompact(Number(entry.value ?? 0))}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AccessTrendChart({ data, loading }: AccessTrendChartProps) {
  if (loading) return <ChartSkeleton className="h-[280px]" />

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4">
        {SERIES.map((series) => (
          <span key={series.key} className="inline-flex items-center gap-1.5 text-[12px] text-ink-soft">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: series.color }} />
            {series.label}
          </span>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <defs>
            {SERIES.map((series) => (
              <linearGradient key={series.gradientId} id={series.gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={series.color} stopOpacity={0.32} />
                <stop offset="100%" stopColor={series.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid stroke="#e5e9f2" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(value: string) => formatShortDate(value)}
            tick={{ fill: '#7c8798', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(value: number) => formatCompact(value)}
            tick={{ fill: '#7c8798', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip content={<TrendTooltip />} cursor={{ stroke: '#d3dae6' }} />
          {SERIES.map((series) => (
            <Area
              key={series.key}
              type="monotone"
              dataKey={series.key}
              name={series.label}
              stackId="access"
              stroke={series.color}
              strokeWidth={2}
              fill={`url(#${series.gradientId})`}
              animationDuration={320}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
