import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { ChartSkeleton } from '@/components/common'
import { formatCompact } from '@/utils/format'
import { ACCESS_EVENT_META } from '@/utils/labels'
import type { ToneIntent } from '@/utils/labels'
import type { EventBreakdownPoint } from '@/types'

/** Event-type volume across the monitoring window. Presentational: props in, no fetching. */
export interface EventBreakdownChartProps {
  data: EventBreakdownPoint[]
  loading?: boolean
}

/** Tailwind-independent hex map for the ACCESS_EVENT_META tones used by recharts fills. */
const TONE_COLORS: Record<ToneIntent, string> = {
  neutral: '#7c8798',
  brand: '#4f46e5',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6',
}

interface BreakdownRow {
  name: string
  count: number
  color: string
}

interface TooltipEntry {
  payload?: BreakdownRow
  value?: number | string
}

interface BreakdownTooltipProps {
  active?: boolean
  payload?: ReadonlyArray<TooltipEntry>
}

function BreakdownTooltip({ active, payload }: BreakdownTooltipProps) {
  const entry = payload?.[0]
  if (!active || !entry) return null
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[12px] shadow-pop">
      <p className="text-ink-soft">{entry.payload?.name}</p>
      <p className="mt-0.5 font-semibold text-ink tabular-nums">
        {formatCompact(Number(entry.value ?? 0))} events
      </p>
    </div>
  )
}

function truncate(value: string, max = 22): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

export function EventBreakdownChart({ data, loading }: EventBreakdownChartProps) {
  if (loading) return <ChartSkeleton className="h-[280px]" />

  const rows: BreakdownRow[] = data.map((point) => {
    const meta = ACCESS_EVENT_META[point.eventType]
    return {
      name: meta?.label ?? point.label,
      count: point.count,
      color: TONE_COLORS[meta?.tone ?? 'neutral'],
    }
  })

  const height = Math.max(260, rows.length * 32)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid stroke="#e5e9f2" horizontal={false} />
        <XAxis
          type="number"
          allowDecimals={false}
          tickFormatter={(value: number) => formatCompact(value)}
          tick={{ fill: '#7c8798', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tickFormatter={(value: string) => truncate(value)}
          tick={{ fill: '#475569', fontSize: 11.5 }}
          tickLine={false}
          axisLine={false}
          width={150}
        />
        <Tooltip content={<BreakdownTooltip />} cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} isAnimationActive={false} barSize={16}>
          {rows.map((row) => (
            <Cell key={row.name} fill={row.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
