import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import {
  Ban,
  Clock,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Link2Off,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  Smartphone,
  TriangleAlert,
} from 'lucide-react'

import { Alert, Button, Input, PasswordInput, Spinner, StatusDot } from '@/components/common'
import { DynamicWatermarkOverlay, WatermarkedRendition } from '@/components/watermark/WatermarkPreview'
import { useCountdown, useDocumentTitle } from '@/hooks'
import { toApiError } from '@/services/api'
import { viewerService } from '@/services/viewer.service'
import { formatDate, formatDuration } from '@/utils/format'
import type { ApiError, ViewerImage, ViewerLinkContext, ViewerSession, ViewerState } from '@/types'
import { LinkSummary, SessionPanel, StatePanel, ViewerCard } from '@/pages/viewer/viewerScreens'

const HEARTBEAT_MS = 60_000

/**
 * Error code the backend returns (HTTP 403) when a protected link is opened on
 * a non-phone device. Recipient links are phone-only, so this is a deliberate
 * policy gate rather than a fault.
 */
const MOBILE_ONLY_CODE = 'mobile_only'

/**
 * Public recipient viewer (route `/:token`).
 *
 * The link token alone is never treated as authorization. Resolving the token
 * only reveals whether the link is usable — opening a link never consumes it.
 * The image-specific username + password submit is the *only* operation that
 * atomically consumes the link and opens the single authorized session, bound
 * to this browser by a Secure, HttpOnly, SameSite cookie.
 *
 * The only asset ever served is a short-lived, recipient-scoped, permanently
 * watermarked rendition — the encrypted original is never exposed.
 */
export default function ProtectedFileViewerPage() {
  useDocumentTitle('Protected image')
  const { token = '' } = useParams<{ token: string }>()
  const hasToken = Boolean(token)

  const [state, setState] = useState<ViewerState>(() => (hasToken ? 'validating' : 'invalid'))
  const [context, setContext] = useState<ViewerLinkContext | null>(null)
  const [session, setSession] = useState<ViewerSession | null>(null)
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [error, setError] = useState<ApiError | null>(() =>
    hasToken
      ? null
      : {
          status: 404,
          code: 'invalid_token',
          message: 'This protected link is missing or malformed.',
        },
  )

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [formError, setFormError] = useState<ApiError | null>(null)
  const [submitting, setSubmitting] = useState(false)

  /* ---------------------------------------------------------------- *
   * 1. Bootstrap: resume an authorized session first (the link is
   *    already consumed for this browser), otherwise resolve the link
   *    state WITHOUT consuming it.
   * ---------------------------------------------------------------- */
  const bootstrap = useCallback(async () => {
    if (!token) return

    try {
      const existing = await viewerService.currentSession(token)
      setActiveImageIndex(0)
      setSession(existing)
      setState('authorized')
      return
    } catch {
      /* No resumable session — continue to resolve the link. */
    }

    try {
      const next = await viewerService.resolveToken(token)
      setContext(next)
      switch (next.state) {
        case 'ACTIVE':
          setState('credentials')
          break
        case 'CONSUMED':
          setState('consumed')
          break
        case 'EXPIRED':
          setState('expired')
          break
        case 'REVOKED':
          setState('revoked')
          break
        default:
          setState('invalid')
          break
      }
    } catch (failure) {
      const apiError = toApiError(failure)
      if (apiError.code === MOBILE_ONLY_CODE) {
        setState('mobile-only')
        return
      }
      setError(apiError)
      setState(apiError.status === 404 ? 'invalid' : 'error')
    }
  }, [token])

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  /* ---------------------------------------------------------------- *
   * 2. Credentials step — the only operation that consumes the link.
   *    A failed authentication leaves the link ACTIVE.
   * ---------------------------------------------------------------- */
  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setFormError(null)

      const nextUsernameError = username.trim() ? null : 'Enter the username you were given.'
      const nextPasswordError = password ? null : 'Enter the password you were given.'
      setUsernameError(nextUsernameError)
      setPasswordError(nextPasswordError)
      if (nextUsernameError || nextPasswordError) return

      setSubmitting(true)
      try {
        const next = await viewerService.authenticate(token, username.trim(), password)
        setActiveImageIndex(0)
        setSession(next)
        setState('authorized')
        void viewerService.recordEvent(next.sessionId, { event: 'opened' })
      } catch (failure) {
        const apiError = toApiError(failure)
        if (apiError.status === 401) {
          /* Wrong credentials are NOT a link-state change — the link stays active. */
          setFormError(apiError)
          setPassword('')
        } else if (apiError.code === MOBILE_ONLY_CODE) {
          setState('mobile-only')
        } else if (apiError.status === 409 || apiError.code === 'link_consumed') {
          setState('consumed')
        } else if (apiError.status === 403 || /revoked/i.test(apiError.message)) {
          setState('revoked')
        } else if (apiError.status === 410 || /expired/i.test(apiError.message)) {
          setState('expired')
        } else if (apiError.status === 404) {
          setState('invalid')
        } else {
          setError(apiError)
          setState('error')
        }
      } finally {
        setSubmitting(false)
      }
    },
    [password, token, username],
  )

  /* ---------------------------------------------------------------- *
   * 3. Session lifecycle: countdown, heartbeat and event logging.
   * ---------------------------------------------------------------- */
  const handleExpire = useCallback(() => setState('session-ended'), [])
  const sessionSeconds = state === 'authorized' && session ? session.remainingSeconds : null
  const sessionRemaining = useCountdown(sessionSeconds, handleExpire)

  const sessionId = session?.sessionId ?? null

  useEffect(() => {
    if (state !== 'authorized' || !sessionId) return
    const timer = window.setInterval(() => {
      void viewerService
        .heartbeat(sessionId)
        .then((result) =>
          setSession((current) =>
            current ? { ...current, remainingSeconds: result.remainingSeconds } : current,
          ),
        )
        .catch(() => setState('session-ended'))
    }, HEARTBEAT_MS)
    return () => window.clearInterval(timer)
  }, [state, sessionId])

  /* Close the session the moment the recipient minimises the browser or leaves
   * the page. `pagehide` covers tab close/backgrounding; `visibilitychange`
   * catches the mobile app-switch case. The close call is idempotent, so the
   * StrictMode double-invoke in development is harmless, and the backend's
   * heartbeat backstop covers a beacon that never arrives. */
  useEffect(() => {
    if (state !== 'authorized' || !sessionId) return
    const close = () => viewerService.closeSession(sessionId)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') close()
    }
    window.addEventListener('pagehide', close)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('pagehide', close)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [sessionId, state])

  /* Record a `closed` event for the session when the viewer unmounts. */
  useEffect(() => {
    if (!sessionId) return
    return () => {
      void viewerService.recordEvent(sessionId, { event: 'closed' })
    }
  }, [sessionId])

  /* Deterrent controls. These are deterrents only — they are logged, and the
   * permanent watermark is what actually deters and traces misuse. */
  useEffect(() => {
    if (state !== 'authorized' || !sessionId) return
    const reportBlocked = (detail: string) => {
      void viewerService.recordEvent(sessionId, { event: 'blocked-action', detail })
    }
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault()
      reportBlocked('context-menu')
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey
      if (modifier && (event.key === 'p' || event.key === 's')) {
        event.preventDefault()
        reportBlocked(event.key === 'p' ? 'print-shortcut' : 'save-shortcut')
      }
      if (event.key === 'PrintScreen') reportBlocked('print-screen')
    }
    document.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [sessionId, state])

  const ownerHint = context?.ownerName
    ? `Contact ${context.ownerName}, who shared this content, if you believe this is a mistake.`
    : undefined

  /* ---------------------------------------------------------------- *
   * Rendering
   * ---------------------------------------------------------------- */
  if (state === 'validating') {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center">
        <Spinner size={26} />
        <p className="text-[13px] font-medium text-ink">Validating this protected link…</p>
        <p className="text-[12px] text-ink-muted">
          Checking that the link is active and has not been consumed.
        </p>
      </div>
    )
  }

  if (state === 'credentials') {
    return (
      <ViewerCard
        icon={<KeyRound size={17} />}
        title={context?.imageCount && context.imageCount > 1 ? 'Sign in to view this album' : 'Sign in to view this image'}
        subtitle="Use the username and password you were given."
        footer={`Opening this link does not grant access. Credentials are valid for this ${context?.imageCount && context.imageCount > 1 ? 'album' : 'image'} only.`}
      >
        {context ? <LinkSummary context={context} /> : null}

        {formError ? (
          <Alert tone="danger" title="We could not sign you in">
            {formError.message} The link is still active, so you can try again.
          </Alert>
        ) : null}

        <form className="space-y-3.5" onSubmit={handleSubmit} noValidate>
          <Input
            label="Username"
            autoComplete="username"
            placeholder="your.username"
            autoFocus
            value={username}
            onChange={(event) => {
              setUsername(event.target.value)
              setUsernameError(null)
              setFormError(null)
            }}
            error={usernameError}
          />
          <PasswordInput
            label="Password"
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              setPasswordError(null)
              setFormError(null)
            }}
            error={passwordError}
          />
          <Button
            type="submit"
            fullWidth
            size="lg"
            loading={submitting}
            leftIcon={<ShieldCheck size={17} />}
          >
            Unlock and view
          </Button>
        </form>

        <Alert tone="warning" title="This link works once">
          The first successful sign-in permanently consumes this link and opens a single authorized
          session in this browser. Do not clear your browser data while viewing.
        </Alert>
      </ViewerCard>
    )
  }

  if (state === 'authorized' && session) {
    const sessionImages: ViewerImage[] =
      session.images?.length
        ? session.images
        : [
            {
              fileId: session.fileId,
              fileName: session.fileName,
              fileKind: session.fileKind,
              extension: session.extension,
              contentUrl: session.contentUrl,
              watermarkLines: session.watermarkLines,
            },
          ]
    const imageIndex = Math.min(activeImageIndex, sessionImages.length - 1)
    const activeImage = sessionImages[imageIndex]

    return (
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-4 flex justify-end">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[11.5px] font-medium text-ink-soft">
            <StatusDot tone="success" pulse />
            Session active · {formatDuration(sessionRemaining)} left
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-3">
            {sessionImages.length > 1 ? (
              <div className="flex items-center justify-between gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<ChevronLeft size={15} />}
                  disabled={imageIndex === 0}
                  onClick={() => setActiveImageIndex((current) => Math.max(0, current - 1))}
                >
                  Previous
                </Button>
                <span className="text-[12px] font-medium text-ink-soft">
                  Image {imageIndex + 1} of {sessionImages.length}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  rightIcon={<ChevronRight size={15} />}
                  disabled={imageIndex >= sessionImages.length - 1}
                  onClick={() =>
                    setActiveImageIndex((current) => Math.min(sessionImages.length - 1, current + 1))
                  }
                >
                  Next
                </Button>
              </div>
            ) : null}
            <WatermarkedRendition
              src={activeImage.contentUrl}
              alt={activeImage.fileName}
              watermarkLines={activeImage.watermarkLines}
              showWatermarkLabels={false}
              fitToViewport
              overlay={
                <DynamicWatermarkOverlay
                  lines={
                    activeImage.watermarkLines.length
                      ? activeImage.watermarkLines
                      : [session.recipientUsername]
                  }
                />
              }
            />
          </div>

          <aside className="space-y-3">
            <SessionPanel session={session} remainingSeconds={sessionRemaining} />
          </aside>
        </div>
      </div>
    )
  }

  /* ---------------------------------------------------------------- *
   * 4. Terminal states. No links to any owner dashboard.
   * ---------------------------------------------------------------- */
  if (state === 'consumed') {
    return (
      <StatePanel
        icon={<Link2Off size={26} />}
        tone="warning"
        title="This link has already been used"
        description="This single-use link was consumed by a successful sign-in and cannot be opened again."
        hint={ownerHint}
      />
    )
  }

  if (state === 'access-denied') {
    return (
      <StatePanel
        icon={<ShieldX size={26} />}
        tone="danger"
        title="Access denied"
        description="This link is not valid for the credentials you entered, or access from this device was blocked."
        hint={ownerHint}
      />
    )
  }

  if (state === 'expired') {
    return (
      <StatePanel
        icon={<Clock size={26} />}
        tone="warning"
        title="This link has expired"
        description={`The share window for “${context?.fileName ?? 'this content'}” has closed, so access is no longer available.${
          context?.expiresAt ? ` It expired on ${formatDate(context.expiresAt)}.` : ''
        }`}
        hint={ownerHint}
      />
    )
  }

  if (state === 'revoked') {
    return (
      <StatePanel
        icon={<Ban size={26} />}
        tone="danger"
        title="Access has been revoked"
        description="The administrator has revoked access to this content."
        hint={ownerHint}
      />
    )
  }

  if (state === 'session-ended') {
    return (
      <StatePanel
        icon={<LockKeyhole size={26} />}
        tone="warning"
        title="This viewing session has ended"
        description="The session reached its time limit or was closed. The link was already consumed, so it cannot be reopened."
        hint={ownerHint}
      />
    )
  }

  if (state === 'mobile-only') {
    return (
      <StatePanel
        icon={<Smartphone size={26} />}
        tone="warning"
        title="Open this link on your phone"
        description="Protected links are restricted to mobile phones. Open the link you were sent on a phone to continue — tablets and computers are not permitted."
        hint={ownerHint}
      />
    )
  }

  if (state === 'invalid') {
    return (
      <StatePanel
        icon={<ShieldX size={26} />}
        tone="danger"
        title="This link is not valid"
        description="The link is malformed, mistyped or no longer exists. Make sure you opened the exact link that was shared with you."
        hint={ownerHint}
      />
    )
  }

  return (
    <StatePanel
      icon={<TriangleAlert size={26} />}
      tone="danger"
      title="We could not open this protected link"
      description={
        error?.message ??
        'The link could not be resolved. It may be mistyped, or the share may no longer exist.'
      }
      actions={
        hasToken ? (
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw size={14} />}
            onClick={() => {
              setError(null)
              setState('validating')
              void bootstrap()
            }}
          >
            Try again
          </Button>
        ) : null
      }
      hint={ownerHint}
    />
  )
}
