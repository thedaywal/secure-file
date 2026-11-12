import { Check, Copy } from 'lucide-react'

import { IconButton } from '@/components/common/Button'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { useToast } from '@/context/ToastContext'
import { cn } from '@/utils/cn'

export interface CopyFieldProps {
  value: string
  label?: string
  /** Renders the value in a monospace font — used for tokens and hashes. */
  mono?: boolean
  /** Displays a masked preview while copying the full value. */
  displayValue?: string
  hint?: string
  className?: string
  /** Shows the value on a single truncated line. */
  truncate?: boolean
}

export function CopyField({
  value,
  label,
  mono,
  displayValue,
  hint,
  className,
  truncate = true,
}: CopyFieldProps) {
  const { copied, copy } = useCopyToClipboard()
  const toast = useToast()

  const handleCopy = async () => {
    const success = await copy(value)
    if (success) {
      toast.success('Copied to clipboard', label ? `${label} copied.` : undefined)
    } else {
      toast.error('Copy failed', 'Your browser blocked clipboard access.')
    }
  }

  return (
    <div className={cn('w-full', className)}>
      {label ? (
        <p className="mb-1.5 text-[12.5px] font-medium text-ink-soft">{label}</p>
      ) : null}
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border border-line bg-surface-subtle px-3 py-2',
        )}
      >
        <code
          className={cn(
            'min-w-0 flex-1 text-[12.5px] text-ink',
            mono && 'font-mono text-[12px]',
            truncate && 'truncate',
          )}
        >
          {displayValue ?? value}
        </code>
        <IconButton
          label={copied ? 'Copied' : 'Copy to clipboard'}
          size="sm"
          variant="ghost"
          onClick={handleCopy}
          className={cn(copied && 'text-success-600')}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </IconButton>
      </div>
      {hint ? <p className="mt-1.5 text-[12px] text-ink-muted">{hint}</p> : null}
    </div>
  )
}
