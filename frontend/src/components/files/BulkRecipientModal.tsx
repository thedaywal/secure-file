import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Check, Copy, Download, FileUp, RotateCcw, Upload } from 'lucide-react'

import { Alert, Badge, Button, IconButton, Modal } from '@/components/common'
import { useToast } from '@/context/ToastContext'
import { useCopyToClipboard } from '@/hooks'
import { toApiError } from '@/services'
import type { ShareCreationResult } from '@/services/shares.service'
import { buildShareUrl } from '@/config/env'
import {
  buildLinksCsv,
  buildRecipientsTemplate,
  parseRecipientsFile,
} from '@/utils/recipientImport'
import type { ExportedLink, ImportedRecipient, ParsedRecipients } from '@/utils/recipientImport'

const MAX_FILE_BYTES = 2 * 1024 * 1024
const PREVIEW_LIMIT = 200

export interface BulkRecipientModalProps {
  open: boolean
  onClose: () => void
  /** Usernames that already have access; matching rows are skipped on import. */
  existingUsernames?: string[]
  /**
   * Creates the recipients. Return the creation result to reveal the issued
   * links, or nothing to simply close the dialog.
   */
  onSubmit: (rows: ImportedRecipient[]) => Promise<ShareCreationResult | void>
}

function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function LinkRow({ link }: { link: ExportedLink }) {
  const { copied, copy } = useCopyToClipboard()
  const toast = useToast()

  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <p className="font-mono text-[12.5px] font-medium text-ink">{link.username}</p>
        <p className="truncate font-mono text-[11.5px] text-ink-muted">{link.url}</p>
      </div>
      <IconButton
        label={`Copy link for ${link.username}`}
        size="sm"
        variant="ghost"
        className={copied ? 'text-success-600' : undefined}
        onClick={async () => {
          const ok = await copy(link.url)
          if (ok) toast.success('Link copied', `Link for ${link.username} copied.`)
          else toast.error('Copy failed', 'Your browser blocked clipboard access.')
        }}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </IconButton>
    </li>
  )
}

/**
 * Bulk-adds recipients from an uploaded credentials file. The file is parsed
 * and reviewed client-side, then every row is submitted in one request, so the
 * batch still aborts atomically if the backend rejects it.
 */
export function BulkRecipientModal({
  open,
  onClose,
  existingUsernames,
  onSubmit,
}: BulkRecipientModalProps) {
  const [step, setStep] = useState<'select' | 'review' | 'links'>('select')
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<ParsedRecipients | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [createdLinks, setCreatedLinks] = useState<ExportedLink[] | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setStep('select')
    setFileName('')
    setParsed(null)
    setParseError(null)
    setSubmitError(null)
    setSubmitting(false)
    setCreatedLinks(null)
  }, [open])

  const existing = useMemo(
    () => new Set<string>((existingUsernames ?? []).map((name) => name.trim())),
    [existingUsernames],
  )
  const ready = useMemo(
    () => (parsed?.rows ?? []).filter((row) => !existing.has(row.username)),
    [parsed, existing],
  )
  const skippedCount = (parsed?.rows.length ?? 0) - ready.length

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setParseError(null)
    if (file.size > MAX_FILE_BYTES) {
      setParseError('That file is larger than 2 MB. Split it into smaller batches.')
      return
    }
    try {
      const text = await file.text()
      setFileName(file.name)
      setParsed(parseRecipientsFile(text))
      setStep('review')
    } catch {
      setParseError('Could not read that file. Try saving it as CSV or plain text.')
    }
  }

  const handleSubmit = async () => {
    if (ready.length === 0) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const result = await onSubmit(ready)
      if (result && result.shares.length > 0) {
        setCreatedLinks(
          result.shares.map((share) => ({
            username: share.recipientUsername,
            url: buildShareUrl(share.url),
          })),
        )
        setStep('links')
      } else {
        onClose()
      }
    } catch (failure) {
      setSubmitError(toApiError(failure).message)
    } finally {
      setSubmitting(false)
    }
  }

  const title =
    step === 'links'
      ? 'Recipient links ready'
      : step === 'review'
        ? 'Review recipients'
        : 'Add recipients in bulk'
  const description =
    step === 'links'
      ? 'Each recipient has their own single-use link. These are shown once — copy or download them now.'
      : step === 'review'
        ? `${fileName} — ${ready.length} ${ready.length === 1 ? 'recipient' : 'recipients'} ready to add.`
        : 'Upload a file with one username and password per line.'

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={title}
      description={description}
      footer={
        step === 'select' ? (
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        ) : step === 'review' ? (
          <>
            <Button
              variant="outline"
              leftIcon={<RotateCcw size={15} />}
              disabled={submitting}
              onClick={() => setStep('select')}
            >
              Choose another file
            </Button>
            <Button
              loading={submitting}
              disabled={ready.length === 0}
              onClick={() => void handleSubmit()}
            >
              Add {ready.length} {ready.length === 1 ? 'recipient' : 'recipients'}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              leftIcon={<Download size={15} />}
              onClick={() => {
                if (!createdLinks) return
                downloadTextFile(
                  `securefile-links-${new Date().toISOString().slice(0, 10)}.csv`,
                  buildLinksCsv(createdLinks),
                )
              }}
            >
              Download links (CSV)
            </Button>
            <Button onClick={onClose}>Done</Button>
          </>
        )
      }
    >
      {step === 'select' ? (
        <div className="space-y-4">
          <Alert tone="info" title="File format">
            One recipient per line as <code>username,password</code> — separated by commas, tabs or
            spaces. An optional header row and an optional third <code>display name</code> column
            are supported.
          </Alert>
          {parseError ? (
            <Alert tone="danger" title="Could not read the file">
              {parseError}
            </Alert>
          ) : null}
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface-subtle/60 px-5 py-9 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/40">
            <span className="flex size-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <Upload size={18} />
            </span>
            <span className="text-[13px] font-medium text-ink">Choose a credentials file</span>
            <span className="text-[12px] text-ink-muted">CSV, TSV or plain text — up to 2 MB</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/plain"
              className="hidden"
              onChange={(event) => void handleFile(event)}
            />
          </label>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<FileUp size={15} />}
            onClick={() =>
              downloadTextFile('securefile-recipients-template.csv', buildRecipientsTemplate())
            }
          >
            Download a template
          </Button>
        </div>
      ) : null}

      {step === 'review' && parsed ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone="success" size="sm">
              {ready.length} ready
            </Badge>
            {skippedCount > 0 ? (
              <Badge tone="neutral" size="sm">
                {skippedCount} already have access
              </Badge>
            ) : null}
            {parsed.duplicateCount > 0 ? (
              <Badge tone="neutral" size="sm">
                {parsed.duplicateCount} duplicated in file
              </Badge>
            ) : null}
            {parsed.issues.length > 0 ? (
              <Badge tone="danger" size="sm">
                {parsed.issues.length} invalid
              </Badge>
            ) : null}
          </div>

          {submitError ? (
            <Alert tone="danger" title="Could not add recipients">
              {submitError}
            </Alert>
          ) : null}

          {ready.length === 0 ? (
            <Alert tone="warning" title="Nothing to import">
              No valid, new rows were found in this file. Check the format and that the usernames are
              not already recipients.
            </Alert>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-line scrollbar-slim">
              <ul className="divide-y divide-line">
                {ready.slice(0, PREVIEW_LIMIT).map((row) => (
                  <li
                    key={row.username}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <span className="font-mono text-[12.5px] text-ink">{row.username}</span>
                    <span className="truncate text-[12px] text-ink-muted">
                      {row.displayName || '—'}
                    </span>
                  </li>
                ))}
              </ul>
              {ready.length > PREVIEW_LIMIT ? (
                <p className="px-3 py-2 text-[12px] text-ink-muted">
                  Showing the first {PREVIEW_LIMIT} of {ready.length}. All of them will be added.
                </p>
              ) : null}
            </div>
          )}

          {parsed.issues.length > 0 ? (
            <div className="rounded-lg border border-danger-200 bg-danger-50/60 px-3.5 py-3">
              <p className="text-[12.5px] font-medium text-danger-700">
                {parsed.issues.length}{' '}
                {parsed.issues.length === 1 ? 'row was skipped' : 'rows were skipped'}
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {parsed.issues.slice(0, 10).map((issue) => (
                  <li key={`${issue.line}-${issue.message}`} className="text-[12px] text-danger-700">
                    Line {issue.line}: {issue.message}
                  </li>
                ))}
              </ul>
              {parsed.issues.length > 10 ? (
                <p className="mt-1.5 text-[12px] text-danger-700">
                  …and {parsed.issues.length - 10} more.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 'links' && createdLinks ? (
        <div className="space-y-3">
          <Alert tone="info" title="Copy these links now">
            The backend stores only a hash of each link, so they cannot be shown again — if one is
            lost, reissue it for that recipient.
          </Alert>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-line scrollbar-slim">
            <ul className="divide-y divide-line">
              {createdLinks.map((link) => (
                <LinkRow key={link.username} link={link} />
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}
