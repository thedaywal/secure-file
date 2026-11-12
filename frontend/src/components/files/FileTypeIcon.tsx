import { FileImage, Image as ImageIcon } from 'lucide-react'

import { cn } from '@/utils/cn'
import type { FileExtension, FileKind } from '@/types'
import type { ToneIntent } from '@/utils/labels'

const EXT_STYLES: Record<FileExtension, { tone: ToneIntent; icon: typeof FileImage }> = {
  JPG: { tone: 'brand', icon: FileImage },
  JPEG: { tone: 'brand', icon: FileImage },
  PNG: { tone: 'brand', icon: ImageIcon },
  WEBP: { tone: 'brand', icon: ImageIcon },
}

const TONE_BG: Record<ToneIntent, string> = {
  neutral: 'bg-navy-900/6 text-ink-soft',
  brand: 'bg-brand-50 text-brand-600',
  success: 'bg-success-50 text-success-600',
  warning: 'bg-warning-50 text-warning-600',
  danger: 'bg-danger-50 text-danger-600',
  info: 'bg-info-50 text-info-600',
}

export interface FileTypeIconProps {
  extension: FileExtension
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const BOX = { sm: 'size-8 rounded-lg', md: 'size-10 rounded-lg', lg: 'size-12 rounded-xl' } as const
const ICON = { sm: 15, md: 18, lg: 22 } as const

export function FileTypeIcon({ extension, size = 'md', className }: FileTypeIconProps) {
  const config = EXT_STYLES[extension] ?? { tone: 'neutral' as ToneIntent, icon: FileImage }
  const Icon = config.icon
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center',
        BOX[size],
        TONE_BG[config.tone],
        className,
      )}
      aria-hidden
    >
      <Icon size={ICON[size]} />
    </span>
  )
}

/** SecureFile only accepts images, so the kind label is always "Image". */
export function fileKindLabel(_kind: FileKind): string {
  return 'Image'
}
