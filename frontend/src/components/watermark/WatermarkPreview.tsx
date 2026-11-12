import { Badge, Card } from '@/components/common'
import { cn } from '@/utils/cn'
import { WATERMARK_PATTERN_LABEL } from '@/utils/labels'
import { WATERMARK_PATTERN } from '@/types'

export interface WatermarkConfigPreviewProps {
  lines: string[]
  opacity: number
  size: number
  className?: string
  height?: number
}

/** 3 × 4 repeated grid — the only approved watermark layout. */
const ROWS = 4
const COLUMNS = 3
const REPETITIONS = ROWS * COLUMNS

function WatermarkBlock({ lines, opacity, size }: { lines: string[]; opacity: number; size: number }) {
  return (
    <span
      className="block text-center leading-tight font-semibold text-navy-900 select-none"
      style={{
        opacity,
        fontSize: `${(10 * size).toFixed(1)}px`,
        transform: 'rotate(-30deg)',
      }}
    >
      {lines.map((line, index) => (
        <span key={`${line}-${index}`} className="block whitespace-nowrap">
          {line}
        </span>
      ))}
    </span>
  )
}

/**
 * CONFIGURATION PREVIEW ONLY.
 *
 * Illustrates how the recipient-scoped watermark is tiled across the whole
 * image. It is *not* the protection mechanism: the backend (Python + Pillow)
 * renders the real rendition and permanently bakes the repeated diagonal
 * watermark into the actual image pixels before the file is ever served.
 */
export function WatermarkConfigPreview({
  lines,
  opacity,
  size,
  className,
  height = 300,
}: WatermarkConfigPreviewProps) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <p className="text-[12.5px] font-medium text-ink">Watermark preview</p>
        <Badge tone="neutral" size="sm">
          {WATERMARK_PATTERN_LABEL[WATERMARK_PATTERN]}
        </Badge>
      </div>
      <div className="watermark-preview relative" style={{ height }}>
        <div className="absolute inset-0 flex flex-col gap-2 p-6" aria-hidden>
          <span className="h-3 w-1/3 rounded bg-navy-900/12" />
          <span className="h-2 w-2/3 rounded bg-navy-900/8" />
          <span className="h-2 w-3/4 rounded bg-navy-900/8" />
          <span className="h-2 w-1/2 rounded bg-navy-900/8" />
          <span className="mt-3 h-2.5 w-1/4 rounded bg-navy-900/12" />
          <span className="h-2 w-4/5 rounded bg-navy-900/8" />
          <span className="h-2 w-2/3 rounded bg-navy-900/8" />
        </div>

        <div
          className="pointer-events-none absolute inset-0 grid place-items-center"
          style={{ gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`, gridTemplateRows: `repeat(${ROWS}, 1fr)` }}
          aria-hidden
        >
          {Array.from({ length: REPETITIONS }).map((_, index) => (
            <WatermarkBlock key={index} lines={lines} opacity={opacity} size={size} />
          ))}
        </div>
      </div>
      <p className="border-t border-line bg-surface-subtle/60 px-4 py-2.5 text-[11.5px] leading-4 text-ink-muted">
        Preview only. In production the repeated diagonal watermark is embedded into the generated
        image pixels by the backend — it is not a CSS overlay.
      </p>
    </Card>
  )
}

export interface WatermarkedRenditionProps {
  src: string
  alt: string
  watermarkLines: string[]
  className?: string
  /** Renders a subtle explanatory caption below the rendition. */
  caption?: string
}

/**
 * Displays the backend-generated, permanently watermarked rendition.
 * The pixels returned by the API already contain the recipient identity.
 */
export function WatermarkedRendition({
  src,
  alt,
  watermarkLines,
  className,
  caption,
}: WatermarkedRenditionProps) {
  return (
    <figure className={cn('flex flex-col gap-2', className)}>
      <div className="overflow-hidden rounded-xl border border-line bg-surface-subtle shadow-card">
        <img src={src} alt={alt} className="block w-full" draggable={false} />
      </div>
      {caption ? <figcaption className="text-[11.5px] text-ink-muted">{caption}</figcaption> : null}
      <div className="flex flex-wrap gap-1.5">
        {watermarkLines.map((line) => (
          <Badge key={line} tone="neutral" size="sm">
            {line}
          </Badge>
        ))}
      </div>
    </figure>
  )
}
