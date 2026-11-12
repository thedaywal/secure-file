import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  KeyRound,
  Lock,
  LogOut,
  MonitorSmartphone,
  Save,
  ShieldCheck,
  Smartphone,
  User,
} from 'lucide-react'

import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  ErrorState,
  InfoList,
  InfoRow,
  Input,
  PasswordInput,
  Progress,
  Select,
  Switch,
  TableSkeleton,
  Tabs,
} from '@/components/common'
import { buildPolicySummary } from '@/components/files'
import { TrustStatusBadge } from '@/components/security/SecurityBadges'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { useAsync, useDocumentTitle } from '@/hooks'
import { adminPath } from '@/routes/navigation'
import { authService, toApiError } from '@/services'
import { devicesService } from '@/services/devices.service'
import { notificationsService } from '@/services/notifications.service'
import { cn } from '@/utils/cn'
import { formatDateTime, formatRelativeTime } from '@/utils/format'
import { NOTIFICATION_CATEGORY_META, type ToneIntent } from '@/utils/labels'
import {
  createDefaultPolicy,
  isEmail,
  PASSWORD_MIN_LENGTH,
  WATERMARK_LOCK_NOTICE,
} from '@/utils/policy'
import type { DigestFrequency, NotificationCategory, NotificationPreference } from '@/types'

type SettingsTab = 'account' | 'security' | 'notifications' | 'session'

const TABS: { value: SettingsTab; label: string; icon: ReactNode }[] = [
  { value: 'account', label: 'Account', icon: <User size={14} /> },
  { value: 'security', label: 'Security', icon: <ShieldCheck size={14} /> },
  { value: 'notifications', label: 'Notifications', icon: <Bell size={14} /> },
  { value: 'session', label: 'Session & devices', icon: <MonitorSmartphone size={14} /> },
]

const DIGEST_OPTIONS = [
  { value: 'instant', label: 'Instant' },
  { value: 'daily', label: 'Daily digest' },
  { value: 'weekly', label: 'Weekly digest' },
]

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  admin: 'Administrator',
  member: 'Member',
}

const TONE_DOT: Record<ToneIntent, string> = {
  neutral: 'bg-navy-900/30',
  brand: 'bg-brand-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
  info: 'bg-info-500',
}

/** Account, security, notification and device settings in one surface. */
export default function SettingsPage() {
  useDocumentTitle('Settings')
  const [tab, setTab] = useState<SettingsTab>('account')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl leading-7 font-semibold tracking-tight text-ink">Settings</h1>
        <p className="mt-1 max-w-3xl text-[13px] leading-5 text-ink-muted">
          Manage your account, security posture, notification preferences and registered devices.
          Anything not backed by a live endpoint is clearly marked as illustrative.
        </p>
      </div>

      <Tabs
        aria-label="Settings sections"
        variant="underline"
        value={tab}
        onChange={setTab}
        items={TABS}
      />

      {tab === 'account' ? <AccountSection /> : null}
      {tab === 'security' ? <SecuritySection /> : null}
      {tab === 'notifications' ? <NotificationsSection /> : null}
      {tab === 'session' ? <SessionSection /> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Account
 * ------------------------------------------------------------------ */
function AccountSection() {
  const { user, updateUser } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState(() => ({
    fullName: user?.fullName ?? '',
    email: user?.email ?? '',
    organization: user?.organization ?? '',
    jobTitle: user?.jobTitle ?? '',
  }))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  if (!user) return null

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next: Record<string, string> = {}
    if (!form.fullName.trim()) next.fullName = 'Full name is required.'
    if (!isEmail(form.email)) next.email = 'Enter a valid email address.'
    setErrors(next)
    if (Object.keys(next).length > 0) {
      toast.warning('Profile not saved', 'Fix the highlighted fields before saving.')
      return
    }

    setSaving(true)
    try {
      const saved = await authService.updateProfile({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        organization: form.organization.trim(),
        jobTitle: form.jobTitle.trim(),
      })
      updateUser(saved)
      toast.success('Profile updated', 'Your account details were saved.')
    } catch (failure) {
      const error = toApiError(failure)
      if (error.fieldErrors) {
        setErrors(
          Object.fromEntries(
            Object.entries(error.fieldErrors).map(([key, messages]) => [key, messages[0] ?? '']),
          ),
        )
      }
      toast.error('Could not save profile', error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader
          title="Profile"
          description="Your name, contact details and organization."
          icon={<User size={16} />}
        />
        <CardBody>
          <Alert tone="info" title="Single administrator" className="mb-4">
            These details identify the one administrator account for this SecureFile deployment.
          </Alert>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Full name"
                required
                value={form.fullName}
                error={errors.fullName}
                onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
              />
              <Input
                label="Email"
                type="email"
                required
                value={form.email}
                error={errors.email}
                hint="Used to sign in and receive password-reset links."
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              />
              <Input
                label="Organization"
                value={form.organization}
                onChange={(event) =>
                  setForm((current) => ({ ...current, organization: event.target.value }))
                }
              />
              <Input
                label="Job title"
                value={form.jobTitle}
                onChange={(event) => setForm((current) => ({ ...current, jobTitle: event.target.value }))}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" leftIcon={<Save size={16} />} loading={saving}>
                Save changes
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setForm({
                    fullName: user.fullName,
                    email: user.email,
                    organization: user.organization ?? '',
                    jobTitle: user.jobTitle ?? '',
                  })
                }
              >
                Reset
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Identity" />
        <CardBody className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar name={user.fullName} src={user.avatarUrl} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-ink">{user.fullName}</p>
              <p className="truncate text-[12.5px] text-ink-muted">{user.email}</p>
            </div>
          </div>
          <InfoList>
            <InfoRow label="Role" value={ROLE_LABEL[user.role] ?? user.role} />
            <InfoRow label="Member since" value={formatDateTime(user.createdAt)} />
          </InfoList>
        </CardBody>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Security
 * ------------------------------------------------------------------ */
interface PasswordStrength {
  score: number
  label: string
  tone: 'danger' | 'warning' | 'success'
}

function passwordStrength(value: string): PasswordStrength {
  if (!value) return { score: 0, label: 'Enter a password', tone: 'danger' }
  let score = 0
  if (value.length >= 8) score += 1
  if (value.length >= 12) score += 1
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1
  if (/\d/.test(value)) score += 1
  if (/[^A-Za-z0-9]/.test(value)) score += 1
  score = Math.min(score, 4)
  const labels = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong']
  const tones: PasswordStrength['tone'][] = ['danger', 'danger', 'warning', 'success', 'success']
  return { score, label: labels[score], tone: tones[score] }
}

function SecuritySection() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const strength = passwordStrength(form.next)
  const policy = createDefaultPolicy()
  const summary = buildPolicySummary(policy)

  if (!user) return null

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next: Record<string, string> = {}
    if (!form.current) next.current = 'Enter your current password.'
    if (form.next.length < PASSWORD_MIN_LENGTH) {
      next.next = `Use at least ${PASSWORD_MIN_LENGTH} characters.`
    } else if (form.next === form.current) {
      next.next = 'Choose a password different from the current one.'
    }
    if (form.confirm !== form.next) next.confirm = 'Passwords do not match.'
    setErrors(next)
    if (Object.keys(next).length > 0) {
      toast.warning('Password not changed', 'Fix the highlighted fields first.')
      return
    }

    setSaving(true)
    try {
      await authService.changePassword(form.current, form.next)
      /* Clear the form so no plaintext password is retained in memory. */
      setForm({ current: '', next: '', confirm: '' })
      setErrors({})
      toast.success(
        'Password updated',
        'Your password was changed and every other session was signed out.',
      )
    } catch (failure) {
      toast.error('Could not change password', toApiError(failure).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Change password"
            description="Choose a strong, unique password."
            icon={<KeyRound size={16} />}
          />
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <PasswordInput
                label="Current password"
                autoComplete="current-password"
                value={form.current}
                error={errors.current}
                onChange={(event) => setForm((current) => ({ ...current, current: event.target.value }))}
              />
              <div className="space-y-2">
                <PasswordInput
                  label="New password"
                  autoComplete="new-password"
                  value={form.next}
                  error={errors.next}
                  onChange={(event) => setForm((current) => ({ ...current, next: event.target.value }))}
                />
                <Progress
                  value={strength.score}
                  max={4}
                  tone={strength.tone}
                  size="sm"
                  label={`Strength · ${strength.label}`}
                />
                <p className="text-[11.5px] text-ink-muted">
                  Use at least {PASSWORD_MIN_LENGTH} characters with a mix of upper/lower case,
                  numbers and symbols.
                </p>
              </div>
              <PasswordInput
                label="Confirm new password"
                autoComplete="new-password"
                value={form.confirm}
                error={errors.confirm}
                onChange={(event) => setForm((current) => ({ ...current, confirm: event.target.value }))}
              />
              <Button type="submit" leftIcon={<KeyRound size={16} />} loading={saving}>
                Update password
              </Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Administrator access"
            description="How this platform authenticates."
            icon={<ShieldCheck size={16} />}
          />
          <CardBody className="space-y-4">
            <div className="rounded-lg border border-line bg-surface-subtle p-3.5">
              <p className="text-[12.5px] font-medium text-ink-soft">Single administrator</p>
              <p className="mt-1 text-[12.5px] leading-5 text-ink-muted">
                SecureFile is operated by exactly one administrator account. There is no public
                registration, no super-admin tier and no general recipient dashboard.
              </p>
            </div>
            <div className="rounded-lg border border-line bg-surface-subtle p-3.5">
              <p className="text-[12.5px] font-medium text-ink-soft">Recipient credentials</p>
              <p className="mt-1 text-[12.5px] leading-5 text-ink-muted">
                You issue image-specific usernames and passwords for each protected image. Recipients
                authenticate against their single-use link and never sign in to this console.
              </p>
            </div>
            <Alert tone="info" title="Passwords are hashed server-side">
              Administrator and recipient passwords are hashed with Argon2 by the backend and are
              never stored or transmitted in plaintext.
            </Alert>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Default security policy"
          description="Applied to every newly protected file. Per-file policies are configured in the Protect workflow."
          icon={<Lock size={16} />}
          actions={
            <Button variant="outline" size="sm" onClick={() => navigate(adminPath('/files/new'))}>
              Configure per file
            </Button>
          }
        />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {summary.map((section) => (
              <div key={section.id} className="rounded-lg border border-line p-4">
                <p className="mb-2 text-[13px] font-semibold text-ink">{section.title}</p>
                <div className="space-y-2">
                  {section.rows.map((row) => (
                    <div key={row.label} className="flex items-center justify-between gap-3">
                      <span className="text-[12.5px] text-ink-soft">{row.label}</span>
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
              </div>
            ))}
          </div>
          <Alert tone="info" title="Permanent watermarking is enforced">
            {WATERMARK_LOCK_NOTICE} These defaults are a summary — each file’s policy is configured
            in the Protect workflow.
          </Alert>
        </CardBody>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Notifications
 * ------------------------------------------------------------------ */
function NotificationsSection() {
  const toast = useToast()
  const prefsState = useAsync(() => notificationsService.getPreferences(), [])
  const [draft, setDraft] = useState<NotificationPreference[] | null>(null)
  const [saving, setSaving] = useState(false)

  /* The pending draft is derived from manual edits once one exists, otherwise
     it mirrors the fetched preferences — no state-sync effect required. */
  const rows = draft ?? prefsState.data
  const dirty = Boolean(
    draft && prefsState.data && JSON.stringify(draft) !== JSON.stringify(prefsState.data),
  )

  const update = (
    category: NotificationCategory,
    patch: Partial<Pick<NotificationPreference, 'email' | 'inApp' | 'digest'>>,
  ) => {
    setDraft((current) => {
      const source = current ?? prefsState.data ?? []
      return source.map((pref) => (pref.category === category ? { ...pref, ...patch } : pref))
    })
  }

  const handleSave = async () => {
    if (!draft) return
    setSaving(true)
    try {
      const saved = await notificationsService.updatePreferences(draft)
      prefsState.setData(saved)
      setDraft(saved.map((pref) => ({ ...pref })))
      toast.success('Preferences saved', 'Your notification preferences were updated.')
    } catch (failure) {
      toast.error('Could not save preferences', toApiError(failure).message)
    } finally {
      setSaving(false)
    }
  }

  if (prefsState.loading || !rows) {
    return prefsState.error ? (
      <ErrorState
        error={prefsState.error}
        title="Could not load notification preferences"
        onRetry={() => void prefsState.reload()}
      />
    ) : (
      <Card>
        <TableSkeleton rows={6} columns={4} />
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader
        title="Notification preferences"
        description="Choose how you are alerted for each security event."
        icon={<Bell size={16} />}
        actions={
          <Button
            leftIcon={<Save size={16} />}
            loading={saving}
            disabled={!dirty}
            onClick={() => void handleSave()}
          >
            Save preferences
          </Button>
        }
      />
      <CardBody>
        <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 border-b border-line pb-2 md:grid">
          <span className="text-[11.5px] font-semibold tracking-wide text-ink-muted uppercase">
            Category
          </span>
          <span className="text-[11.5px] font-semibold tracking-wide text-ink-muted uppercase">
            Email
          </span>
          <span className="text-[11.5px] font-semibold tracking-wide text-ink-muted uppercase">
            In-app
          </span>
          <span className="text-[11.5px] font-semibold tracking-wide text-ink-muted uppercase">
            Digest
          </span>
        </div>

        <div className="divide-y divide-line">
          {rows.map((pref) => {
            const meta = NOTIFICATION_CATEGORY_META[pref.category]
            return (
              <div
                key={pref.category}
                className="grid gap-3 py-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-center md:gap-4"
              >
                <div>
                  <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
                    <span className={cn('size-2 shrink-0 rounded-full', TONE_DOT[meta.tone])} aria-hidden />
                    {meta.label}
                  </p>
                  {meta.description ? (
                    <p className="mt-0.5 text-[12px] leading-4 text-ink-muted">{meta.description}</p>
                  ) : null}
                </div>
                <Switch
                  label="Email"
                  checked={pref.email}
                  onCheckedChange={(checked) => update(pref.category, { email: checked })}
                />
                <Switch
                  label="In-app"
                  checked={pref.inApp}
                  onCheckedChange={(checked) => update(pref.category, { inApp: checked })}
                />
                <Select
                  aria-label={`${meta.label} digest frequency`}
                  value={pref.digest}
                  options={DIGEST_OPTIONS}
                  onChange={(event) =>
                    update(pref.category, { digest: event.target.value as DigestFrequency })
                  }
                />
              </div>
            )
          })}
        </div>

        <p className="mt-4 text-[11.5px] text-ink-muted">
          Preferences are saved through the notifications preferences endpoint. Security-critical
          alerts may still be delivered regardless of these settings.
        </p>
      </CardBody>
    </Card>
  )
}

/* ------------------------------------------------------------------ *
 * Session & devices
 * ------------------------------------------------------------------ */
function SessionSection() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const devicesState = useAsync(() => devicesService.list({ pageSize: 5 }), [])
  const [confirming, setConfirming] = useState(false)
  const [revoking, setRevoking] = useState(false)

  if (!user) return null

  const devices = devicesState.data?.results ?? []

  const handleSignOutEverywhere = async () => {
    setRevoking(true)
    try {
      await authService.revokeAllSessions()
      toast.success('Signed out everywhere', 'Every active session on your account was revoked.')
      await logout()
      navigate(adminPath('/login'))
    } catch (failure) {
      toast.error('Could not revoke sessions', toApiError(failure).message)
    } finally {
      setRevoking(false)
      setConfirming(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Current session" description="The session you are using right now." />
          <CardBody className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar name={user.fullName} src={user.avatarUrl} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-ink">{user.fullName}</p>
                <p className="truncate text-[12.5px] text-ink-muted">{user.email}</p>
              </div>
            </div>
            <InfoList>
              <InfoRow label="Role" value={ROLE_LABEL[user.role] ?? user.role} />
              <InfoRow label="Signed in since" value={formatDateTime(user.createdAt)} />
              <InfoRow
                label="Last sign-in"
                value={user.lastLoginAt ? formatRelativeTime(user.lastLoginAt) : '—'}
              />
            </InfoList>
            <Alert tone="info" title="Tokens are held in memory only">
              The access token lives in memory and is never written to durable storage. In
              production the refresh token should be an httpOnly cookie issued by the backend.
            </Alert>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Sessions"
            description="Sign out of every device at once."
            icon={<ShieldCheck size={16} />}
          />
          <CardBody className="space-y-4">
            <p className="text-[12.5px] leading-5 text-ink-muted">
              Signing out everywhere revokes every access and refresh token on your account,
              including this browser. You will be asked to sign in again.
            </p>
            <Button
              variant="danger"
              leftIcon={<LogOut size={16} />}
              loading={revoking}
              onClick={() => setConfirming(true)}
            >
              Sign out everywhere
            </Button>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Registered devices"
          description="The five most recently active devices linked to your account."
          icon={<MonitorSmartphone size={16} />}
          actions={
            <Button variant="outline" size="sm" onClick={() => navigate(adminPath('/devices'))}>
              View all devices
            </Button>
          }
        />
        {devicesState.loading ? (
          <TableSkeleton rows={5} columns={3} />
        ) : devicesState.error ? (
          <ErrorState
            error={devicesState.error}
            title="Could not load devices"
            onRetry={() => void devicesState.reload()}
            compact
          />
        ) : devices.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-ink-muted">
            No devices are registered against your account yet.
          </p>
        ) : (
          <CardBody className="divide-y divide-line py-0">
            {devices.map((device) => (
              <div
                key={device.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-subtle text-ink-soft">
                    <Smartphone size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-ink">{device.label}</p>
                    <p className="truncate text-[12px] text-ink-muted">
                      {device.os} · {device.browser} · active {formatRelativeTime(device.lastActiveAt)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <TrustStatusBadge status={device.trustStatus} />
                </div>
              </div>
            ))}
          </CardBody>
        )}
      </Card>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={handleSignOutEverywhere}
        title="Sign out everywhere?"
        description="Every active session on your account will be revoked, including this browser. You will need to sign in again."
        confirmLabel="Sign out everywhere"
        tone="danger"
      />
    </div>
  )
}
