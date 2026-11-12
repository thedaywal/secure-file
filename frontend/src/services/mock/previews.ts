/**
 * MOCK ONLY — synthetic image renditions.
 *
 * In production the Django backend (Python + Pillow) decrypts the original
 * image, renders a recipient-scoped copy and bakes a repeated diagonal
 * watermark into the actual pixels *before* the file is ever served. No
 * endpoint here returns the original, unwatermarked asset.
 *
 * For local development we generate an SVG rendition whose watermark is part of
 * the generated image content (not a CSS overlay on top of the real file), so
 * the viewer behaves the same way as the production integration.
 */

interface PreviewOptions {
  title: string
  subtitle?: string
  /** Repeated diagonal watermark lines: recipient username + access timestamp. */
  watermarkLines: string[]
  opacity: number
  size: number
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * The approved configuration is a repeated diagonal pattern that covers the
 * entire image, including important content areas.
 */
function renderWatermark(options: PreviewOptions, width: number, height: number): string {
  const { watermarkLines, opacity, size } = options
  if (watermarkLines.length === 0) return ''

  const fontSize = Math.round(15 * size)
  const fillOpacity = Math.max(0.05, Math.min(opacity, 0.6))

  const renderBlock = (cx: number, cy: number) => {
    const lines = watermarkLines
      .map(
        (line, index) =>
          `<tspan x="${cx}" dy="${index === 0 ? 0 : fontSize + 4}">${escapeXml(line)}</tspan>`,
      )
      .join('')
    return `<text x="${cx}" y="${cy}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="${fontSize}" font-weight="600" fill="#0f172a" fill-opacity="${fillOpacity}" letter-spacing="0.4" transform="rotate(-30 ${cx} ${cy})">${lines}</text>`
  }

  const blocks: string[] = []
  const columns = 3
  const rows = 4
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const cx = ((column + 0.5) / columns) * width
      const cy = ((row + 0.5) / rows) * height
      blocks.push(renderBlock(cx, cy))
    }
  }
  return `<g>${blocks.join('')}</g>`
}

function renderPhotoBody(width: number, height: number): string {
  return `<defs>
      <linearGradient id="photo" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#1e293b" />
        <stop offset="55%" stop-color="#334155" />
        <stop offset="100%" stop-color="#0f172a" />
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#photo)" />
    <circle cx="${width * 0.68}" cy="${height * 0.3}" r="150" fill="#475569" fill-opacity="0.55" />
    <circle cx="${width * 0.25}" cy="${height * 0.72}" r="210" fill="#1e3a8a" fill-opacity="0.45" />
    <rect x="0" y="${height * 0.58}" width="${width}" height="${height * 0.42}" fill="#0b1220" fill-opacity="0.55" />`
}

export function buildRenditionPreview(options: PreviewOptions): string {
  const width = 1200
  const height = 820

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXml(options.title)}">
    ${renderPhotoBody(width, height)}
    <text x="64" y="48" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="600" fill="#f8fafc">${escapeXml(options.title)}</text>
    ${options.subtitle ? `<text x="${width - 64}" y="48" text-anchor="end" font-family="Inter, Arial, sans-serif" font-size="12" fill="#cbd5e1">${escapeXml(options.subtitle)}</text>` : ''}
    ${renderWatermark(options, width, height)}
  </svg>`

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
