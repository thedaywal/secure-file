import { useEffect, useState, type ReactNode } from 'react'

import { Badge, Card } from '@/components/common'
import { cn } from '@/utils/cn'
import { formatTime } from '@/utils/format'
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
      className="block text-center leading-tight font-bold text-black select-none"
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
  /** Hides redundant watermark metadata below the image in recipient view. */
  showWatermarkLabels?: boolean
  /** Rendered on top of the image, clipped to its bounds (e.g. the moving mark). */
  overlay?: ReactNode
  /**
   * Shrink-wraps the frame to the image and caps it to the viewport height, so a
   * tall portrait photo fits the page instead of being scaled to full width.
   * The frame must hug the image for the overlay's percentage positions to land
   * on the image rather than on empty letterbox space.
   */
  fitToViewport?: boolean
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
  showWatermarkLabels = true,
  overlay,
  fitToViewport = false,
}: WatermarkedRenditionProps) {
  return (
    <figure className={cn('flex flex-col gap-2', className)}>
      <div
        className={cn(
          'relative overflow-hidden rounded-xl border border-line bg-surface-subtle shadow-card',
          fitToViewport && 'mx-auto w-fit max-w-full',
        )}
      >
        <img
          src={src}
          alt={alt}
          className={cn('block', fitToViewport ? 'max-h-[76dvh] w-auto max-w-full' : 'w-full')}
          draggable={false}
        />
        {overlay}
      </div>
      {showWatermarkLabels ? (
        <div className="flex flex-wrap gap-1.5">
          {watermarkLines.map((line) => (
            <Badge key={line} tone="neutral" size="sm">
              {line}
            </Badge>
          ))}
        </div>
      ) : null}
    </figure>
  )
}

/* ------------------------------------------------------------------ *
 * Moving on-screen mark for the recipient viewer.
 *
 * The backend already burns a static, tiled watermark into the image pixels —
 * that survives cropping. This layer adds the one thing baked pixels cannot
 * carry: the *current* time. It drifts between positions, so every frame of a
 * screen recording — and any photo of the screen — captures the viewer's
 * identity and the exact moment, and it cannot simply be cropped away because
 * it never stays in one place.
 *
 * A deterrent, like the viewer's other controls: it raises the cost of
 * leaking. It cannot stop a second phone pointed at the screen.
 * ------------------------------------------------------------------ */
const OVERLAY_SPOTS: { top: string; left: string }[][] = [
  [
    { top: '8%', left: '6%' },
    { top: '82%', left: '68%' },
    { top: '48%', left: '40%' },
  ],
  [
    { top: '10%', left: '62%' },
    { top: '80%', left: '10%' },
    { top: '46%', left: '34%' },
  ],
  [
    { top: '46%', left: '8%' },
    { top: '50%', left: '66%' },
    { top: '14%', left: '38%' },
  ],
  [
    { top: '78%', left: '38%' },
    { top: '16%', left: '34%' },
    { top: '64%', left: '62%' },
  ],
]
const OVERLAY_MOVE_MS = 5_000
const OVERLAY_TRANSITION_MS = 2_500

export interface DynamicWatermarkOverlayProps {
  /** Identity lines, matching the watermark baked into the pixels. */
  lines: string[]
  className?: string
}

export function DynamicWatermarkOverlay({ lines, className }: DynamicWatermarkOverlayProps) {
  const [now, setNow] = useState(() => new Date())
  const [spot, setSpot] = useState(0)

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 1_000)
    const mover = window.setInterval(
      () => setSpot((current) => (current + 1) % OVERLAY_SPOTS.length),
      OVERLAY_MOVE_MS,
    )
    return () => {
      window.clearInterval(clock)
      window.clearInterval(mover)
    }
  }, [])

  const stamp = formatTime(now)
  const positions = OVERLAY_SPOTS[spot]

  return (
    <div
      className={cn('pointer-events-none absolute inset-0 z-10 select-none', className)}
      aria-hidden
    >
      {positions.map((position, index) => (
        <span
          key={index}
          className="absolute flex flex-col items-center text-center leading-tight font-semibold text-black/35"
          style={{
            top: position.top,
            left: position.left,
            fontSize: 'clamp(11px, 1.7vw, 20px)',
            textShadow: '0 0 4px rgba(255,255,255,0.9), 0 0 2px rgba(255,255,255,0.9)',
            transitionProperty: 'top, left',
            transitionDuration: `${OVERLAY_TRANSITION_MS}ms`,
            transitionTimingFunction: 'ease-in-out',
          }}
        >
          {lines.map((line) => (
            <span key={line} className="whitespace-nowrap">
              {line}
            </span>
          ))}
          <span className="whitespace-nowrap tabular-nums">{stamp}</span>
        </span>
      ))}
    </div>
  )
}
