import { useMemo, useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  FileCheck2,
  FilePlus2,
  FolderLock,
  Lock,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from 'lucide-react'

import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  InfoRow,
  Input,
  PageHeader,
  Progress,
  Stepper,
} from '@/components/common'
import type { Step } from '@/components/common'
import {
  FileTypeIcon,
  PolicyEditor,
  buildPolicySummary,
} from '@/components/files'
import type { PolicySummarySection } from '@/components/files'
import { useToast } from '@/context/ToastContext'
import { useDocumentTitle } from '@/hooks'
import { adminPath } from '@/routes/navigation'
import { filesService } from '@/services/files.service'
import { toApiError } from '@/services'
import { cn } from '@/utils/cn'
import { formatBytes } from '@/utils/format'
import { createDefaultPolicy, validatePolicy } from '@/utils/policy'
import type { Album, FileExtension, FilePolicy, SecureFile } from '@/types'

/* ------------------------------------------------------------------ *
 * Accepted upload types — SecureFile only accepts images.
 * ------------------------------------------------------------------ */
const ALLOWED_EXTENSIONS: readonly string[] = ['JPG', 'JPEG', 'PNG', 'WEBP']
type AllowedExtension = 'JPG' | 'JPEG' | 'PNG' | 'WEBP'

const MIME_BY_EXTENSION: Record<AllowedExtension, string[]> = {
  JPG: ['image/jpeg'],
  JPEG: ['image/jpeg'],
  PNG: ['image/png'],
  WEBP: ['image/webp'],
}

const ALLOWED_LABEL = 'JPG, JPEG, PNG or WebP'
const ACCEPT_ATTRIBUTE = '.jpg,.jpeg,.png,.webp'
const MAX_ALBUM_IMAGES = 20
const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const MAX_ALBUM_TOTAL_BYTES = 100 * 1024 * 1024

function extensionOf(name: string): string {
  const parts = name.split('.')
  return parts.length > 1 ? (parts.pop() ?? '').toUpperCase() : ''
}

/** Client-side validation is a UX affordance — the backend re-validates. */
function validateFile(file: File): string | null {
  if (file.size > MAX_IMAGE_BYTES) return 'Each image must be 25 MB or smaller.'
  const extension = extensionOf(file.name)
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return `Unsupported file type. SecureFile protects images only (${ALLOWED_LABEL}).`
  }
  const allowedMime = MIME_BY_EXTENSION[extension as AllowedExtension]
  if (file.type && !allowedMime.includes(file.type)) {
    return `That file's contents do not match its .${extension.toLowerCase()} extension. SecureFile protects images only.`
  }
  return null
}

const STEPS: Step[] = [
  { id: 'image', label: 'Select images', description: 'Choose one image or create an album' },
  { id: 'security', label: 'Configure security', description: 'Set the protection policy' },
  { id: 'review', label: 'Review', description: 'Confirm and encrypt' },
]

type SubmitStage = 'upload' | 'policy'

const STAGE_META: Record<SubmitStage, { label: string; value: number }> = {
  upload: { label: 'Encrypting and uploading images…', value: 40 },
  policy: { label: 'Applying the protection policy…', value: 85 },
}

/** Multi-step "Protect a File" workflow. All state lives in this page. */
export default function ProtectFilePage() {
  useDocumentTitle('Protect a file')
  const navigate = useNavigate()
  const toast = useToast()

  const [step, setStep] = useState(0)

  /* Step 1 — one image or an album of images */
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [albumName, setAlbumName] = useState('')
  const [fileError, setFileError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  /* Step 2 — policy */
  const [policy, setPolicy] = useState<FilePolicy>(() => createDefaultPolicy())
  const [policyErrors, setPolicyErrors] = useState<Record<string, string>>({})

  /* Step 3 — submission */
  const [submitting, setSubmitting] = useState(false)
  const [submitStage, setSubmitStage] = useState<SubmitStage | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const summarySections = useMemo<PolicySummarySection[]>(() => buildPolicySummary(policy), [policy])
  const activeProtections = useMemo(
    () =>
      summarySections.reduce(
        (total, section) =>
          total +
          section.rows.filter((row) => row.status.kind === 'toggle' && row.status.on).length,
        0,
      ),
    [summarySections],
  )

  const selectedFile = selectedFiles[0] ?? null
  const extension = selectedFile ? (extensionOf(selectedFile.name) as FileExtension) : null
  const selectedTotalBytes = selectedFiles.reduce((total, file) => total + file.size, 0)
  const albumDisplayName =
    albumName.trim() || selectedFile?.name.replace(/\.[^.]+$/, '') || 'Image album'

  /* ---------------- Step 1 handlers ---------------- */
  const acceptFiles = (incoming: File[]) => {
    const candidates = incoming.filter(
      (file) =>
        !selectedFiles.some(
          (selected) =>
            selected.name === file.name &&
            selected.size === file.size &&
            selected.lastModified === file.lastModified,
        ),
    )
    if (selectedFiles.length + candidates.length > MAX_ALBUM_IMAGES) {
      setFileError(`An album can contain at most ${MAX_ALBUM_IMAGES} images.`)
      return
    }
    if (selectedTotalBytes + candidates.reduce((total, file) => total + file.size, 0) > MAX_ALBUM_TOTAL_BYTES) {
      setFileError('The combined album size must be 100 MB or less.')
      return
    }
    const invalid = candidates.map(validateFile).find(Boolean)
    if (invalid) {
      setFileError(invalid)
      return
    }
    setFileError(null)
    setSelectedFiles((current) => [...current, ...candidates])
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragActive(false)
    const dropped = Array.from(event.dataTransfer.files ?? [])
    if (dropped.length) acceptFiles(dropped)
  }

  /* ---------------- Navigation ---------------- */
  const handleBack = () => {
    setSubmitError(null)
    setStep((current) => Math.max(0, current - 1))
  }

  const handleContinue = () => {
    if (step === 0) {
      if (selectedFiles.length === 0) {
        setFileError(`Choose at least one image (${ALLOWED_LABEL}) to protect.`)
        return
      }
      setStep(1)
      return
    }
    if (step === 1) {
      const errors = validatePolicy(policy)
      setPolicyErrors(errors)
      if (Object.keys(errors).length > 0) {
        toast.warning('Check the policy', 'Fix the highlighted fields before continuing.')
        return
      }
      setStep(2)
      return
    }
  }

  /* ---------------- Submit ---------------- */
  const handleProtect = async () => {
    if (selectedFiles.length === 0) return
    setSubmitError(null)
    setSubmitting(true)
    try {
      setSubmitStage('upload')
      let createdAlbum: Album | null = null
      let uploadedFiles: SecureFile[]
      if (selectedFiles.length > 1) {
        createdAlbum = await filesService.uploadAlbum({
          files: selectedFiles,
          name: albumDisplayName,
        })
        uploadedFiles = createdAlbum.images
      } else {
        uploadedFiles = [await filesService.upload({ file: selectedFiles[0] })]
      }
      const primaryFile = uploadedFiles[0]
      if (!primaryFile) throw new Error('The upload did not return any images.')

      setSubmitStage('policy')
      await Promise.all(uploadedFiles.map((file) => filesService.updatePolicy(file.id, policy)))

      toast.success(
        createdAlbum ? 'Album protected' : 'Image protected',
        createdAlbum
          ? `${createdAlbum.name} with ${uploadedFiles.length} images is ready. Add recipients to share it.`
          : `${primaryFile.name} is encrypted and watermarked. Add recipients to share it.`,
      )
      navigate(adminPath(`/files/${primaryFile.id}`))
    } catch (failure) {
      const message = toApiError(failure).message
      setSubmitError(message)
      toast.error('Could not protect the image', message)
    } finally {
      setSubmitting(false)
      setSubmitStage(null)
    }
  }

  const allSummaryRows = summarySections

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumbs={[{ label: 'Protected files', to: adminPath('/files') }, { label: 'Protect a file' }]}
        title="Protect images"
        description="Protect one image or group several images into an album. Add recipients once the file is protected."
      />

      <Card>
        <CardBody>
          <Stepper steps={STEPS} current={step} className="hidden lg:flex" />
          <Stepper steps={STEPS} current={step} orientation="vertical" className="lg:hidden" />
        </CardBody>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          {/* ---------------- Step 1: Select image ---------------- */}
          {step === 0 ? (
            <div className="space-y-4">
              <div
                onDragOver={(event) => {
                  event.preventDefault()
                  setDragActive(true)
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={cn(
                  'flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors',
                  dragActive ? 'border-brand-500 bg-brand-50/60' : 'border-line bg-surface-subtle/50',
                )}
              >
                <span className="flex size-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <UploadCloud size={22} />
                </span>
                <p className="mt-4 text-[14px] font-medium text-ink">
                  Drag and drop images here
                </p>
                <p className="mt-1 text-[12.5px] text-ink-muted">
                  Accepted formats: {ALLOWED_LABEL} · up to 20 images per album, 25 MB each
                </p>
                <div className="mt-5">
                  <Button
                    variant="outline"
                    leftIcon={<FilePlus2 size={16} />}
                    onClick={() => inputRef.current?.click()}
                  >
                    Browse files
                  </Button>
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT_ATTRIBUTE}
                  multiple
                  className="sr-only"
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? [])
                    if (files.length) acceptFiles(files)
                    event.target.value = ''
                  }}
                />
              </div>

              {fileError ? <Alert tone="danger" title="File not accepted">{fileError}</Alert> : null}

              {selectedFiles.length > 1 ? (
                <Input
                  label="Album name"
                  placeholder={albumDisplayName}
                  value={albumName}
                  onChange={(event) => setAlbumName(event.target.value)}
                  maxLength={255}
                  hint="Recipients open one link and browse all images in this album."
                />
              ) : null}

              {selectedFiles.length > 0 ? (
                <Card>
                  <CardHeader
                    title={selectedFiles.length === 1 ? 'Selected image' : `Album images (${selectedFiles.length})`}
                    description={selectedFiles.length > 1 ? albumDisplayName : undefined}
                  />
                  <CardBody className="divide-y divide-line py-0">
                    {selectedFiles.map((file, index) => {
                      const fileExtension = extensionOf(file.name) as FileExtension
                      return (
                        <div key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center gap-3 py-3">
                          <FileTypeIcon extension={fileExtension} size="md" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium text-ink">{file.name}</p>
                            <p className="text-[11.5px] text-ink-muted">
                              {fileExtension} · {formatBytes(file.size)}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={<Trash2 size={15} />}
                            onClick={() => {
                              setSelectedFiles((current) => current.filter((_, item) => item !== index))
                              setFileError(null)
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      )
                    })}
                    <div className="py-3 text-right text-[12px] text-ink-muted">
                      Total {formatBytes(selectedTotalBytes)}
                    </div>
                  </CardBody>
                </Card>
              ) : null}

              <Alert tone="info" title="Encrypted on the server">
                Each image is encrypted with AES-256-GCM before storage. Recipients browse the album
                through one link, and each image is watermarked for that recipient.
              </Alert>
            </div>
          ) : null}

          {/* ---------------- Step 2: Configure security ---------------- */}
          {step === 1 ? (
            <div className="space-y-4">
              <PolicyEditor policy={policy} onChange={setPolicy} errors={policyErrors} />
            </div>
          ) : null}

          {/* ---------------- Step 3: Review ---------------- */}
          {step === 2 ? (
            <div className="space-y-4">
              {submitError ? (
                <Alert tone="danger" title="Protection failed">
                  {submitError}
                </Alert>
              ) : null}

              <Alert tone="warning" title="Before you continue">
                Permanent recipient-scoped watermarking cannot be disabled — the backend embeds the
                recipient username into every image. You will add recipients after the file is
                protected.
              </Alert>

              {selectedFiles.length > 0 ? (
                <Card>
                  <CardHeader
                    icon={<FileCheck2 size={16} />}
                    title={selectedFiles.length > 1 ? 'Album' : 'Image'}
                  />
                  <CardBody className="space-y-4">
                    {selectedFiles.length > 1 ? (
                      <InfoRow label="Album name" value={albumDisplayName} />
                    ) : null}
                    <div className="space-y-2">
                      {selectedFiles.map((file) => {
                        const fileExtension = extensionOf(file.name) as FileExtension
                        return (
                          <div key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center gap-3">
                            <FileTypeIcon extension={fileExtension} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-medium text-ink">{file.name}</p>
                              <p className="text-[11.5px] text-ink-muted">
                                {fileExtension} · {formatBytes(file.size)}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <dl>
                      <InfoRow label="Encryption" value="AES-256-GCM" />
                      <InfoRow label="Viewing" value="Protected viewer only" />
                      <InfoRow label="Download controls" value="Disabled" />
                      <InfoRow label="Print controls" value="Disabled" />
                    </dl>
                  </CardBody>
                </Card>
              ) : null}

              <Card>
                <CardHeader
                  icon={<ShieldCheck size={16} />}
                  title="Protection policy"
                  description="Derived directly from the policy you configured."
                />
                <CardBody className="grid gap-5 sm:grid-cols-2">
                  {allSummaryRows.map((section) => (
                    <div key={section.id} className="space-y-2.5">
                      <p className="text-[12.5px] font-semibold text-ink">{section.title}</p>
                      {section.rows.map((row) => (
                        <div key={row.label} className="flex items-center justify-between gap-3">
                          <span className="text-[12px] text-ink-soft">{row.label}</span>
                          {row.status.kind === 'toggle' ? (
                            <Badge tone={row.status.on ? 'success' : 'neutral'} size="sm">
                              {row.status.on ? 'On' : 'Off'}
                            </Badge>
                          ) : (
                            <Badge tone="neutral" size="sm">
                              {row.status.text}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </CardBody>
              </Card>
            </div>
          ) : null}

          {submitting && submitStage ? (
            <Card>
              <CardBody>
                <Progress
                  value={STAGE_META[submitStage].value}
                  tone="brand"
                  label={STAGE_META[submitStage].label}
                  showValue
                />
              </CardBody>
            </Card>
          ) : null}
        </div>

        {/* ---------------- Sticky summary rail ---------------- */}
        <aside className="hidden xl:block">
          <div className="sticky top-20 space-y-5">
            <Card>
              <CardHeader
                icon={<FolderLock size={16} />}
                title="Summary"
                description="A live view of what you are about to protect."
              />
              <CardBody className="space-y-4">
                {selectedFiles.length > 0 && selectedFile && extension ? (
                  <div className="flex items-center gap-3">
                    <FileTypeIcon extension={extension} size="md" />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-ink">
                        {selectedFiles.length > 1 ? albumDisplayName : selectedFile.name}
                      </p>
                      <p className="text-[11.5px] text-ink-muted">
                        {selectedFiles.length > 1
                          ? `${selectedFiles.length} images · ${formatBytes(selectedTotalBytes)}`
                          : formatBytes(selectedFile.size)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-[12.5px] text-ink-muted">No image selected yet.</p>
                )}
                <dl className="border-t border-line pt-3">
                  <InfoRow label="Active protections" value={`${activeProtections} enabled`} />
                  <InfoRow label="Encryption" value="AES-256-GCM" />
                </dl>
                <p className="flex items-start gap-1.5 text-[11.5px] leading-4 text-warning-700">
                  <Lock size={13} className="mt-0.5 shrink-0" aria-hidden />
                  Permanent watermarking is always on and cannot be disabled.
                </p>
              </CardBody>
            </Card>
          </div>
        </aside>
      </div>

      {/* ---------------- Footer navigation ---------------- */}
      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-3 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Button
          variant="outline"
          leftIcon={<ArrowLeft size={16} />}
          disabled={step === 0 || submitting}
          onClick={handleBack}
        >
          Back
        </Button>

        {step < 2 ? (
          <Button
            rightIcon={<ArrowRight size={16} />}
            onClick={handleContinue}
            disabled={submitting}
          >
            Continue
          </Button>
        ) : null}

        {step === 2 ? (
          <Button
            leftIcon={<ShieldCheck size={16} />}
            loading={submitting}
            onClick={() => void handleProtect()}
          >
            Protect image
          </Button>
        ) : null}
      </div>
    </div>
  )
}
