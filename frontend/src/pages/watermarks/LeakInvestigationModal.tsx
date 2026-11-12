import { useState } from 'react'
import { Eye, ScanSearch } from 'lucide-react'

import { Alert, Badge, Button, InfoList, InfoRow, Input, Modal } from '@/components/common'
import { useToast } from '@/context/ToastContext'
import { toApiError } from '@/services'
import { watermarkService } from '@/services/watermark.service'
import { WATERMARK_PATTERN_LABEL } from '@/utils/labels'
import { formatDateTime } from '@/utils/format'
import type { WatermarkLookupResult } from '@/types'

export interface LeakInvestigationModalProps {
  open: boolean
  onClose: () => void
  /** Navigate to a matched watermark record for the full audit trail. */
  onInspect: (recordId: string) => void
}

/**
 * Administrator investigation surface: compare a suspected leaked image against
 * stored watermark records by output hash or access ID. The result never
 * over-claims — a removed or reconstructed mark cannot be attributed.
 */
export function LeakInvestigationModal({ open, onClose, onInspect }: LeakInvestigationModalProps) {
  const toast = useToast()
  const [outputHash, setOutputHash] = useState('')
  const [accessId, setAccessId] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<WatermarkLookupResult | null>(null)

  const reset = () => {
    setOutputHash('')
    setAccessId('')
    setResult(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleCompare = async () => {
    if (!outputHash.trim() && !accessId.trim()) {
      toast.warning('Nothing to compare', 'Provide an output hash or an access ID.')
      return
    }
    setBusy(true)
    try {
      const lookup = await watermarkService.lookup({
        outputHash: outputHash.trim() || undefined,
        accessId: accessId.trim() || undefined,
      })
      setResult(lookup)
    } catch (failure) {
      toast.error('Could not compare', toApiError(failure).message)
    } finally {
      setBusy(false)
    }
  }

  const record = result?.record ?? null

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="lg"
      title="Investigate a suspected leak"
      description="Compare a leaked image against the stored watermark records before attributing it."
      footer={
        <>
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
          <Button leftIcon={<ScanSearch size={16} />} loading={busy} onClick={() => void handleCompare()}>
            Compare
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Output hash (SHA-256)"
            placeholder="e3b0c442…"
            value={outputHash}
            onChange={(event) => setOutputHash(event.target.value)}
            hint="The hash recorded when the rendition was generated."
          />
          <Input
            label="Access ID"
            placeholder="acc_8f21c0"
            value={accessId}
            onChange={(event) => setAccessId(event.target.value)}
            hint="Or match on the access/session identifier from the record."
          />
        </div>

        {!result ? (
          <Alert tone="info" title="How attribution works">
            Enter either value and compare. A byte-exact hash match attributes the image directly; an
            access-ID match still requires you to confirm the extracted watermark lines below.
          </Alert>
        ) : (
          <div className="space-y-4">
            {record ? (
              result.hashMatches ? (
                <Alert tone="success" title="Byte-exact match">
                  {result.summary}
                </Alert>
              ) : (
                <Alert tone="info" title="Matched on access ID">
                  {result.summary}
                </Alert>
              )
            ) : (
              <Alert tone="warning" title="No match found">
                {result.summary}
              </Alert>
            )}

            {result.extractedLines.length > 0 ? (
              <div className="rounded-lg border border-line bg-surface-subtle/60 p-3.5">
                <p className="text-[12px] font-medium text-ink-soft">
                  Extracted watermark lines
                </p>
                <div className="mt-2 space-y-1">
                  {result.extractedLines.map((line) => (
                    <p key={line} className="font-mono text-[12.5px] text-ink">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}

            {record ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{WATERMARK_PATTERN_LABEL[record.pattern]}</Badge>
                  <Badge tone={result.hashMatches ? 'success' : 'neutral'}>
                    {result.hashMatches ? 'Hash verified' : 'Hash not verified'}
                  </Badge>
                </div>
                <InfoList>
                  <InfoRow label="Original image" value={record.fileName} />
                  <InfoRow label="Recipient username" value={record.recipientUsername} mono />
                  <InfoRow label="Access ID" value={record.accessId} mono />
                  <InfoRow label="Generated" value={formatDateTime(record.generatedAt)} />
                </InfoList>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Eye size={14} />}
                  onClick={() => onInspect(record.id)}
                >
                  Open watermark record
                </Button>
              </>
            ) : null}
          </div>
        )}

        <p className="text-[11.5px] leading-4 text-ink-muted">
          SecureFile cannot attribute an image whose watermark was removed or reconstructed. Treat the
          comparison as supporting evidence, not proof of identification.
        </p>
      </div>
    </Modal>
  )
}
