import { Check, Copy } from 'lucide-react'

import { IconButton } from '@/components/common'
import { useToast } from '@/context/ToastContext'
import { useCopyToClipboard } from '@/hooks'
import { cn } from '@/utils/cn'
import { truncateHash } from '@/utils/format'

export interface HashCopyProps {
  hash: string
  /** Number of characters kept on each edge of the truncated preview. */
  edge?: number
  className?: string
}

/**
 * Truncated, copyable output-hash preview shared by the watermark list and the
 * watermark detail view. The full hash is still what gets copied to clipboard.
 */
export function HashCopy({ hash, edge, className }: HashCopyProps) {
  const { copied, copy } = useCopyToClipboard()
  const toast = useToast()

  const handleCopy = async () => {
    const success = await copy(hash)
    if (success) {
      toast.success('Copied to clipboard', 'Output file hash copied.')
    } else {
      toast.error('Copy failed', 'Your browser blocked clipboard access.')
    }
  }

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <code className="font-mono text-[12px] text-ink-soft" title={hash}>
        {truncateHash(hash, edge)}
      </code>
      <IconButton
        label={copied ? 'Copied' : 'Copy output hash'}
        size="sm"
        variant="ghost"
        onClick={handleCopy}
        className={cn(copied && 'text-success-600')}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </IconButton>
    </span>
  )
}
