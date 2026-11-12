import { useMemo, useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  FilePlus2,
  FolderLock,
  KeyRound,
  Link2,
  Lock,
  Mail,
  MessageCircle,
  Pencil,
  Share2,
  ShieldCheck,
  Trash2,
  UploadCloud,
  Users,
} from 'lucide-react'

import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CopyField,
  IconButton,
  InfoRow,
  Input,
  PageHeader,
  PasswordInput,
  Progress,
  Stepper,
} from '@/components/common'
import type { Step } from '@/components/common'
import {
  FileTypeIcon,
  PolicyEditor,
  RecipientFormModal,
  RecipientPermissionsFields,
  buildPolicySummary,
  createRecipientDraft,
  permissionChipLabels,
} from '@/components/files'
import type { RecipientDraft, RecipientFormValues } from '@/components/files'
import type { PolicySummarySection } from '@/components/files'
import { useToast } from '@/context/ToastContext'
import { useDocumentTitle } from '@/hooks'
import { buildShareUrl } from '@/config/env'
import { adminPath } from '@/routes/navigation'
import { sharesService } from '@/services/shares.service'
import { filesService } from '@/services/files.service'
import { toApiError } from '@/services'
import { cn } from '@/utils/cn'
import { formatBytes } from '@/utils/format'
import {
  createDefaultPermissions,
  createDefaultPolicy,
  validatePolicy,
  validateRecipientPassword,
  validateUsername,
} from '@/utils/policy'
import type {
  FileExtension,
  FilePolicy,
  RecipientPermissions,
  SecureFile,
  ShareLink,
} from '@/types'

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

/** Matches the outline/sm Button styling for anchor-based share actions. */
const OUTLINE_LINK_CLASS =
  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink transition-colors hover:border-brand-300 hover:bg-brand-50/60 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none'
/** Soft guidance only — the backend enforces the real upload limit. */
const SOFT_SIZE_LIMIT = 25 * 1024 * 1024

function extensionOf(name: string): string {
  const parts = name.split('.')
  return parts.length > 1 ? (parts.pop() ?? '').toUpperCase() : ''
}

/** Client-side validation is a UX affordance — the backend re-validates. */
function validateFile(file: File): string | null {
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
  { id: 'image', label: 'Select image', description: 'Choose the image to protect' },
  { id: 'security', label: 'Configure security', description: 'Set the protection policy' },
  { id: 'recipients', label: 'Assign recipients', description: 'Create credentials per recipient' },
  { id: 'review', label: 'Review', description: 'Confirm and encrypt' },
  { id: 'share', label: 'Sharing links', description: 'Send the single-use link' },
]

type SubmitStage = 'upload' | 'policy' | 'shares'

const STAGE_META: Record<SubmitStage, { label: string; value: number }> = {
  upload: { label: 'Encrypting and uploading the image…', value: 30 },
  policy: { label: 'Applying the protection policy…', value: 65 },
  shares: { label: 'Issuing single-use access links…', value: 95 },
}

function recipientLabel(recipient: RecipientDraft): string {
  return recipient.displayName || recipient.username
}

/** Multi-step "Protect a File" workflow. All state lives in this page. */
export default function ProtectFilePage() {
  useDocumentTitle('Protect a file')
  const navigate = useNavigate()
  const toast = useToast()

  const [step, setStep] = useState(0)

  /* Step 1 — image */
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  /* Step 2 — policy */
  const [policy, setPolicy] = useState<FilePolicy>(() => createDefaultPolicy())
  const [policyErrors, setPolicyErrors] = useState<Record<string, string>>({})

  /* Step 3 — recipients */
  const [recipients, setRecipients] = useState<RecipientDraft[]>([])
  const [draftUsername, setDraftUsername] = useState('')
  const [draftDisplayName, setDraftDisplayName] = useState('')
  const [draftPassword, setDraftPassword] = useState('')
  const [draftPermissions, setDraftPermissions] = useState<RecipientPermissions>(() =>
    createDefaultPermissions(),
  )
  const [draftUsernameError, setDraftUsernameError] = useState<string | null>(null)
  const [draftPasswordError, setDraftPasswordError] = useState<string | null>(null)
  const [recipientsBlocked, setRecipientsBlocked] = useState(false)
  const [editing, setEditing] = useState<RecipientDraft | null>(null)

  /* Step 4/5 — submission */
  const [submitting, setSubmitting] = useState(false)
  const [submitStage, setSubmitStage] = useState<SubmitStage | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [createdFile, setCreatedFile] = useState<SecureFile | null>(null)
  const [createdShares, setCreatedShares] = useState<ShareLink[]>([])

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

  const extension = selectedFile ? (extensionOf(selectedFile.name) as FileExtension) : null
  const oversizeWarning = Boolean(selectedFile && selectedFile.size > SOFT_SIZE_LIMIT)

  /* ---------------- Step 1 handlers ---------------- */
  const acceptFile = (file: File) => {
    const problem = validateFile(file)
    if (problem) {
      setFileError(problem)
      setSelectedFile(null)
      return
    }
    setFileError(null)
    setSelectedFile(file)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragActive(false)
    const file = event.dataTransfer.files?.[0]
    if (file) acceptFile(file)
  }

  /* ---------------- Step 3 handlers ---------------- */
  const addRecipientDraft = (draft: RecipientDraft) => {
    setRecipients((current) => {
      if (current.some((item) => item.username.toLowerCase() === draft.username.toLowerCase())) {
        toast.warning('Recipient already added', `${draft.username} is already on the list.`)
        return current
      }
      return [...current, draft]
    })
  }

  const handleQuickAdd = () => {
    const usernameProblem = validateUsername(draftUsername)
    const passwordProblem = validateRecipientPassword(draftPassword)
    setDraftUsernameError(usernameProblem)
    setDraftPasswordError(passwordProblem)
    if (usernameProblem || passwordProblem) return

    addRecipientDraft(
      createRecipientDraft({
        username: draftUsername.trim(),
        displayName: draftDisplayName.trim(),
        password: draftPassword,
        permissions: draftPermissions,
      }),
    )
    setDraftUsername('')
    setDraftDisplayName('')
    setDraftPassword('')
    setDraftPermissions(createDefaultPermissions())
  }

  const handleEditRecipient = (values: RecipientFormValues) => {
    if (!editing) return
    setRecipients((current) =>
      current.map((item) =>
        item.id === editing.id
          ? {
              ...item,
              displayName: values.displayName,
              permissions: values.permissions,
            }
          : item,
      ),
    )
    setEditing(null)
  }

  const handleRemoveRecipient = (draft: RecipientDraft) => {
    setRecipients((current) => current.filter((item) => item.id !== draft.id))
  }

  /* ---------------- Navigation ---------------- */
  const handleBack = () => {
    setSubmitError(null)
    setStep((current) => Math.max(0, current - 1))
  }

  const handleContinue = () => {
    if (step === 0) {
      if (!selectedFile) {
        setFileError(`Choose an image (${ALLOWED_LABEL}) to protect.`)
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
    if (step === 2) {
      if (recipients.length === 0) {
        setRecipientsBlocked(true)
        toast.warning('Add a recipient', 'At least one authorized recipient is required.')
        return
      }
      setRecipientsBlocked(false)
      setStep(3)
      return
    }
  }

  /* ---------------- Submit ---------------- */
  const handleProtect = async () => {
    if (!selectedFile) return
    setSubmitError(null)
    setSubmitting(true)
    try {
      setSubmitStage('upload')
      const created = await filesService.upload({ file: selectedFile })
      setCreatedFile(created)

      setSubmitStage('policy')
      await filesService.updatePolicy(created.id, policy)

      setSubmitStage('shares')
      const result = await sharesService.createForFile(created.id, {
        fileId: created.id,
        recipients: recipients.map((item) => ({
          username: item.username,
          password: item.password,
          displayName: item.displayName || undefined,
          permissions: item.permissions,
        })),
      })
      setCreatedShares(result.shares)
      toast.success(
        'Image protected',
        `${created.name} is encrypted, watermarked and ready to share.`,
      )
      setStep(4)
    } catch (failure) {
      const message = toApiError(failure).message
      setSubmitError(message)
      toast.error('Could not protect the image', message)
    } finally {
      setSubmitting(false)
      setSubmitStage(null)
    }
  }

  const handleNativeShare = async (share: ShareLink) => {
    const url = buildShareUrl(share.url)
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: createdFile?.name ?? 'Protected image',
          text: 'A protected image has been shared with you securely.',
          url,
        })
      } catch {
        /* The recipient dismissed the native share sheet — nothing to do. */
      }
      return
    }
    toast.info('Sharing is not supported here', 'Copy the link and send it manually.')
  }

  const shareMessage = (share: ShareLink) =>
    `${createdFile?.name ?? 'A protected image'} has been shared with you securely.\n` +
    `Sign in with your assigned credentials to view your watermarked copy: ${buildShareUrl(share.url)}\n` +
    'This link is single-use and can only be opened once.'

  const allSummaryRows = summarySections

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumbs={[{ label: 'Protected files', to: adminPath('/files') }, { label: 'Protect a file' }]}
        title="Protect a file"
        description="Encrypt an image, set its protection policy, and issue a single-use, permanently watermarked link for each recipient."
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
                  Drag and drop your image here
                </p>
                <p className="mt-1 text-[12.5px] text-ink-muted">
                  Accepted formats: {ALLOWED_LABEL} · up to 25 MB recommended
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
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) acceptFile(file)
                    event.target.value = ''
                  }}
                />
              </div>

              {fileError ? <Alert tone="danger" title="File not accepted">{fileError}</Alert> : null}

              {selectedFile && extension ? (
                <Card>
                  <CardBody>
                    <div className="flex items-center gap-4">
                      <FileTypeIcon extension={extension} size="lg" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-medium text-ink">
                          {selectedFile.name}
                        </p>
                        <p className="mt-0.5 text-[12.5px] text-ink-muted">
                          {extension} · {formatBytes(selectedFile.size)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Trash2 size={15} />}
                        onClick={() => {
                          setSelectedFile(null)
                          setFileError(null)
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              ) : null}

              {oversizeWarning ? (
                <Alert tone="warning" title="Large image">
                  This image is larger than the recommended 25 MB. Uploads still work, but very large
                  assets may take longer to encrypt and watermark.
                </Alert>
              ) : null}

              <Alert tone="info" title="Encrypted on the server">
                SecureFile encrypts your image with AES-256-GCM before it is stored. The original
                image is never served to recipients — they only ever receive their own watermarked
                copy through the protected browser viewer.
              </Alert>
            </div>
          ) : null}

          {/* ---------------- Step 2: Configure security ---------------- */}
          {step === 1 ? (
            <div className="space-y-4">
              <PolicyEditor policy={policy} onChange={setPolicy} errors={policyErrors} />
            </div>
          ) : null}

          {/* ---------------- Step 3: Assign recipients ---------------- */}
          {step === 2 ? (
            <div className="space-y-4">
              {recipientsBlocked ? (
                <Alert tone="danger" title="Add at least one recipient">
                  A protected link must be issued to at least one authorized recipient.
                </Alert>
              ) : null}

              <Card>
                <CardHeader
                  icon={<KeyRound size={16} />}
                  title="Create recipient credentials"
                  description="Each recipient gets a username and password for this image only."
                />
                <CardBody className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label="Username"
                      type="text"
                      inputMode="numeric"
                      maxLength={10}
                      placeholder="10-digit username"
                      value={draftUsername}
                      onChange={(event) => {
                        setDraftUsername(event.target.value.replace(/\D/g, '').slice(0, 10))
                        setDraftUsernameError(null)
                      }}
                      error={draftUsernameError}
                      hint="Exactly 10 digits. This image-specific ID is embedded in the watermark."
                    />
                    <Input
                      label="Display name (optional)"
                      placeholder="Amara Okafor"
                      value={draftDisplayName}
                      onChange={(event) => setDraftDisplayName(event.target.value)}
                    />
                  </div>
                  <PasswordInput
                    label="Password"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="10-digit password"
                    value={draftPassword}
                    onChange={(event) => {
                      setDraftPassword(event.target.value.replace(/\D/g, '').slice(0, 10))
                      setDraftPasswordError(null)
                    }}
                    error={draftPasswordError}
                    hint="Exactly 10 digits. Hashed with Argon2; share it securely with the recipient."
                  />
                  <div>
                    <p className="mb-2 text-[13px] font-medium text-ink">Permissions</p>
                    <RecipientPermissionsFields
                      permissions={draftPermissions}
                      onChange={setDraftPermissions}
                    />
                  </div>
                  <Button leftIcon={<FilePlus2 size={16} />} onClick={handleQuickAdd}>
                    Add recipient
                  </Button>
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title={`Recipients (${recipients.length})`}
                  description="Each recipient gets their own single-use link and their own watermarked image."
                />
                {recipients.length === 0 ? (
                  <CardBody>
                    <p className="py-6 text-center text-[13px] text-ink-muted">
                      No recipients added yet.
                    </p>
                  </CardBody>
                ) : (
                  <CardBody className="divide-y divide-line py-0">
                    {recipients.map((recipient) => (
                      <div
                        key={recipient.id}
                        className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div className="flex min-w-0 gap-3">
                          <Avatar name={recipientLabel(recipient)} size="md" />
                          <div className="min-w-0 space-y-2">
                            <div className="min-w-0">
                              <p className="truncate text-[13.5px] font-medium text-ink">
                                {recipientLabel(recipient)}
                              </p>
                              <p className="flex items-center gap-1 truncate font-mono text-[12px] text-ink-muted">
                                <KeyRound size={12} aria-hidden />
                                {recipient.username}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {permissionChipLabels(recipient.permissions).map((chip) => (
                                <Badge key={chip} tone="neutral" size="sm">
                                  {chip}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <IconButton
                            label="Edit permissions"
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditing(recipient)}
                          >
                            <Pencil size={15} />
                          </IconButton>
                          <IconButton
                            label="Remove recipient"
                            size="sm"
                            variant="ghost"
                            className="text-danger-600 hover:bg-danger-50"
                            onClick={() => handleRemoveRecipient(recipient)}
                          >
                            <Trash2 size={15} />
                          </IconButton>
                        </div>
                      </div>
                    ))}
                  </CardBody>
                )}
              </Card>
            </div>
          ) : null}

          {/* ---------------- Step 4: Review ---------------- */}
          {step === 3 ? (
            <div className="space-y-4">
              {submitError ? (
                <Alert tone="danger" title="Protection failed">
                  {submitError}
                </Alert>
              ) : null}

              <Alert tone="warning" title="Before you continue">
                Permanent recipient-scoped watermarking cannot be disabled — the backend embeds the
                recipient username and access timestamp into every image. Links are single-use and
                every access attempt is logged in monitoring.
              </Alert>

              {selectedFile && extension ? (
                <Card>
                  <CardHeader icon={<FileCheck2 size={16} />} title="Image" />
                  <CardBody className="space-y-4">
                    <div className="flex items-center gap-4">
                      <FileTypeIcon extension={extension} size="lg" />
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-medium text-ink">
                          {selectedFile.name}
                        </p>
                        <p className="mt-0.5 text-[12.5px] text-ink-muted">
                          {extension} · {formatBytes(selectedFile.size)}
                        </p>
                      </div>
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

              <Card>
                <CardHeader title={`Recipients (${recipients.length})`} icon={<Users size={16} />} />
                <CardBody className="space-y-3">
                  {recipients.map((recipient) => (
                    <div key={recipient.id} className="flex items-center gap-3">
                      <Avatar name={recipientLabel(recipient)} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] text-ink">{recipientLabel(recipient)}</p>
                        <p className="truncate font-mono text-[11.5px] text-ink-muted">
                          {recipient.username}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardBody>
              </Card>
            </div>
          ) : null}

          {/* ---------------- Step 5: Sharing link ---------------- */}
          {step === 4 ? (
            <div className="space-y-4">
              <Alert tone="success" title="Your image is protected" icon={<CheckCircle2 size={16} />}>
                {createdFile?.name ?? 'The image'} is encrypted, watermarked and ready to share. Send
                each recipient their own single-use link and credentials below.
              </Alert>

              {createdShares.map((share) => (
                <Card key={share.id}>
                  <CardHeader
                    icon={<Link2 size={16} />}
                    title={share.recipientUsername}
                    description="Single-use access link"
                  />
                  <CardBody className="space-y-4">
                    <CopyField
                      label="Protected access link"
                      value={buildShareUrl(share.url)}
                      mono
                      hint="Single-use: it is consumed on the first successful authentication and cannot be reopened, even on the same device."
                    />
                    <div className="flex flex-wrap gap-2">
                      <a
                        className={OUTLINE_LINK_CLASS}
                        href={`https://wa.me/?text=${encodeURIComponent(shareMessage(share))}`}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        <MessageCircle size={15} />
                        WhatsApp
                      </a>
                      <a
                        className={OUTLINE_LINK_CLASS}
                        href={`mailto:?subject=${encodeURIComponent(
                          `Protected image: ${createdFile?.name ?? ''}`,
                        )}&body=${encodeURIComponent(shareMessage(share))}`}
                      >
                        <Mail size={15} />
                        Email
                      </a>
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={<Share2 size={15} />}
                        onClick={() => void handleNativeShare(share)}
                      >
                        Share via…
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              ))}

              <Alert tone="info" title="How these links stay protected">
                Each link is consumed by the first successful authentication and only one authorized
                browser session may exist per link. If the recipient clears their browser data they
                cannot reopen the link — reissue it from the shared files page.
              </Alert>

              {createdFile ? (
                <Card>
                  <CardHeader title="Your protected image" />
                  <CardBody className="space-y-4">
                    <dl>
                      <InfoRow label="Status" value="Protected" />
                      <InfoRow label="Recipients" value={String(recipients.length)} />
                      <InfoRow label="Active protections" value={`${activeProtections} enabled`} />
                    </dl>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        leftIcon={<FileCheck2 size={16} />}
                        onClick={() => navigate(adminPath(`/files/${createdFile.id}`))}
                      >
                        View file details
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => navigate(adminPath(`/monitoring/files/${createdFile.id}`))}
                      >
                        Monitor access
                      </Button>
                      <Button
                        variant="ghost"
                        leftIcon={<FilePlus2 size={16} />}
                        onClick={() => {
                          setStep(0)
                          setSelectedFile(null)
                          setFileError(null)
                          setPolicy(createDefaultPolicy())
                          setPolicyErrors({})
                          setRecipients([])
                          setDraftUsername('')
                          setDraftDisplayName('')
                          setDraftPassword('')
                          setDraftUsernameError(null)
                          setDraftPasswordError(null)
                          setRecipientsBlocked(false)
                          setSubmitError(null)
                          setCreatedFile(null)
                          setCreatedShares([])
                        }}
                      >
                        Protect another image
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              ) : null}
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
                {selectedFile && extension ? (
                  <div className="flex items-center gap-3">
                    <FileTypeIcon extension={extension} size="md" />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-ink">
                        {selectedFile.name}
                      </p>
                      <p className="text-[11.5px] text-ink-muted">
                        {formatBytes(selectedFile.size)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-[12.5px] text-ink-muted">No image selected yet.</p>
                )}
                <dl className="border-t border-line pt-3">
                  <InfoRow label="Active protections" value={`${activeProtections} enabled`} />
                  <InfoRow label="Recipients" value={String(recipients.length)} />
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
          disabled={step === 0 || step === 4 || submitting}
          onClick={handleBack}
        >
          Back
        </Button>

        {step < 3 ? (
          <Button
            rightIcon={<ArrowRight size={16} />}
            onClick={handleContinue}
            disabled={submitting}
          >
            Continue
          </Button>
        ) : null}

        {step === 3 ? (
          createdFile ? (
            <Button onClick={() => setStep(4)}>View sharing links</Button>
          ) : (
            <Button
              leftIcon={<ShieldCheck size={16} />}
              loading={submitting}
              onClick={() => void handleProtect()}
            >
              Protect image
            </Button>
          )
        ) : null}

        {step === 4 ? (
          <Button onClick={() => navigate(adminPath('/files'))}>Back to protected files</Button>
        ) : null}
      </div>

      <RecipientFormModal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit recipient"
        description="Usernames and passwords are fixed once issued. Adjust permissions here."
        submitLabel="Save recipient"
        lockUsername
        initial={
          editing
            ? {
                username: editing.username,
                password: editing.password,
                displayName: editing.displayName,
                permissions: editing.permissions,
              }
            : undefined
        }
        onSubmit={handleEditRecipient}
      />
    </div>
  )
}
