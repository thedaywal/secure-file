import { useEffect, useMemo, useState } from 'react'
import { BellOff, CheckCheck, Inbox, Settings2 } from 'lucide-react'

import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  Skeleton,
  StatusDot,
  Switch,
  Tabs,
} from '@/components/common'
import { SeverityBadge } from '@/components/security/SecurityBadges'
import { useToast } from '@/context/ToastContext'
import { useAsync, useDebouncedValue, useDocumentTitle, usePagination } from '@/hooks'
import { toApiError } from '@/services'
import { notificationsService } from '@/services/notifications.service'
import { cn } from '@/utils/cn'
import { formatDateTime, formatRelativeTime } from '@/utils/format'
import {
  NOTIFICATION_CATEGORY_META,
  NOTIFICATION_CATEGORY_OPTIONS,
  NOTIFICATION_SEVERITY_META,
} from '@/utils/labels'
import { NOTIFICATION_CATEGORIES } from '@/types'
import type { AppNotification, DigestFrequency, NotificationPreference } from '@/types'

type TabValue = 'inbox' | 'preferences'

const CATEGORY_FILTER_OPTIONS = [
  { value: 'all', label: 'All categories' },
  ...NOTIFICATION_CATEGORY_OPTIONS,
]

const DIGEST_OPTIONS = [
  { value: 'instant', label: 'Instant' },
  { value: 'daily', label: 'Daily digest' },
  { value: 'weekly', label: 'Weekly digest' },
]

/** Ensures every known category is present, defaulting anything missing. */
function normalizePreferences(preferences: NotificationPreference[]): NotificationPreference[] {
  return NOTIFICATION_CATEGORIES.map((category) => {
    const existing = preferences.find((preference) => preference.category === category)
    return existing ? { ...existing, category } : { category, email: true, inApp: true, digest: 'instant' }
  })
}

/** Inbox of security notifications plus per-category delivery preferences. */
export default function NotificationsPage() {
  useDocumentTitle('Notifications')
  const toast = useToast()

  const [tab, setTab] = useState<TabValue>('inbox')

  /* ---- Inbox state ---- */
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput, 350)
  const [category, setCategory] = useState('all')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const { page, pageSize, setPage, setPageSize, reset } = usePagination(10)

  useEffect(() => {
    reset()
  }, [debouncedSearch, category, unreadOnly, reset])

  const { data, loading, error, reload, setData } = useAsync(
    () =>
      notificationsService.list({
        page,
        pageSize,
        search: debouncedSearch || undefined,
        category: category === 'all' ? undefined : category,
        unreadOnly: unreadOnly || undefined,
      }),
    [page, pageSize, debouncedSearch, category, unreadOnly],
  )

  const unread = useAsync(() => notificationsService.unreadCount(), [])
  const unreadCount = unread.data ?? 0

  const notifications = data?.results ?? []
  const totalItems = data?.count ?? 0
  const totalPages = data?.totalPages ?? 1
  const hasFilters = debouncedSearch.length > 0 || category !== 'all' || unreadOnly

  const handleOpen = async (notification: AppNotification) => {
    if (notification.read) return
    setData((current) =>
      current
        ? {
            ...current,
            results: current.results.map((item) =>
              item.id === notification.id ? { ...item, read: true } : item,
            ),
          }
        : current,
    )
    unread.setData((current) => Math.max(0, (current ?? 0) - 1))
    try {
      await notificationsService.markRead(notification.id)
    } catch (failure) {
      setData((current) =>
        current
          ? {
              ...current,
              results: current.results.map((item) =>
                item.id === notification.id ? { ...item, read: false } : item,
              ),
            }
          : current,
      )
      void unread.reload()
      toast.error('Could not mark as read', toApiError(failure).message)
    }
  }

  const handleMarkAllRead = async () => {
    const previous = data
    const previousUnread = unread.data
    setData((current) =>
      current
        ? { ...current, results: current.results.map((item) => ({ ...item, read: true })) }
        : current,
    )
    unread.setData(0)
    try {
      await notificationsService.markAllRead()
      toast.success('All notifications marked as read')
      await Promise.all([reload(), unread.reload()])
    } catch (failure) {
      setData(() => previous)
      unread.setData(() => previousUnread)
      toast.error('Could not mark all as read', toApiError(failure).message)
    }
  }

  /* ---- Preferences state ---- */
  const {
    data: prefsData,
    loading: prefsLoading,
    error: prefsError,
    reload: reloadPrefs,
    setData: setPrefsData,
  } = useAsync(() => notificationsService.getPreferences(), [])

  const [overrides, setOverrides] = useState<
    Partial<Record<NotificationPreference['category'], Partial<Omit<NotificationPreference, 'category'>>>>
  >({})
  const [saving, setSaving] = useState(false)

  const savedPrefs = useMemo(() => normalizePreferences(prefsData ?? []), [prefsData])
  const draft = useMemo(
    () => savedPrefs.map((preference) => ({ ...preference, ...overrides[preference.category] })),
    [savedPrefs, overrides],
  )
  const dirty = Object.keys(overrides).length > 0

  const updatePreference = (
    category: NotificationPreference['category'],
    patch: Partial<Omit<NotificationPreference, 'category'>>,
  ) => {
    setOverrides((current) => ({
      ...current,
      [category]: { ...current[category], ...patch },
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = await notificationsService.updatePreferences(draft)
      setOverrides({})
      setPrefsData(normalizePreferences(updated))
      toast.success('Preferences saved', 'Your notification delivery settings were updated.')
    } catch (failure) {
      toast.error('Could not save preferences', toApiError(failure).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        description="Security alerts about your protected files and the delivery preferences that decide where each category is sent."
      />

      <Tabs
        aria-label="Notification sections"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'inbox', label: 'Inbox', icon: <Inbox size={15} />, count: unreadCount },
          { value: 'preferences', label: 'Preferences', icon: <Settings2 size={15} /> },
        ]}
      />

      {tab === 'inbox' ? (
        <Card>
          <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="w-full lg:max-w-xs">
              <SearchInput
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onClear={() => setSearchInput('')}
                placeholder="Search notifications…"
                aria-label="Search notifications"
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Select
                aria-label="Filter by category"
                className="w-auto min-w-[196px]"
                value={category}
                options={CATEGORY_FILTER_OPTIONS}
                onChange={(event) => setCategory(event.target.value)}
              />
              <Switch
                label="Unread only"
                checked={unreadOnly}
                onCheckedChange={setUnreadOnly}
                className="items-center gap-2"
              />
              <Button
                variant="outline"
                size="sm"
                leftIcon={<CheckCheck size={15} />}
                disabled={unreadCount === 0}
                onClick={() => void handleMarkAllRead()}
              >
                Mark all as read
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="divide-y divide-line">
              {Array.from({ length: pageSize }).map((_, index) => (
                <div key={index} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
                  <Skeleton className="mt-1.5 size-2 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-1/3" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <ErrorState
              error={error}
              title="Could not load notifications"
              onRetry={() => void reload()}
              className="py-12"
            />
          ) : notifications.length === 0 ? (
            <EmptyState
              icon={<BellOff size={20} />}
              title={hasFilters ? 'No notifications match these filters' : 'No notifications yet'}
              description={
                hasFilters
                  ? 'Try a different search term, or clear the category and unread filters.'
                  : 'Security alerts about your protected files will appear here.'
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => void handleOpen(notification)}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors sm:px-5',
                      notification.read ? 'hover:bg-surface-subtle/50' : 'bg-brand-50/30 hover:bg-brand-50/50',
                    )}
                  >
                    <span className="mt-1.5">
                      <StatusDot
                        tone={NOTIFICATION_SEVERITY_META[notification.severity].tone}
                        pulse={!notification.read}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className={cn(
                            'text-[13px]',
                            notification.read ? 'font-medium text-ink-soft' : 'font-semibold text-ink',
                          )}
                        >
                          {notification.title}
                        </p>
                        <SeverityBadge severity={notification.severity} />
                        <span className="text-[11.5px] text-ink-muted">
                          {NOTIFICATION_CATEGORY_META[notification.category].label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[12.5px] leading-5 text-ink-muted">
                        {notification.message}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span
                        className="text-[11.5px] whitespace-nowrap text-ink-muted"
                        title={formatDateTime(notification.createdAt)}
                      >
                        {formatRelativeTime(notification.createdAt)}
                      </span>
                      {!notification.read ? (
                        <span className="mt-1 block text-[11px] font-medium text-brand-600">
                          Unread
                        </span>
                      ) : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!loading && !error && notifications.length > 0 ? (
            <Pagination
              page={page}
              pageSize={pageSize}
              totalItems={totalItems}
              totalPages={totalPages}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              itemLabel="notifications"
            />
          ) : null}
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="Delivery preferences"
            description="Choose how each notification category reaches you. The server enforces these settings at delivery time."
            actions={
              <Button
                onClick={() => void handleSave()}
                loading={saving}
                disabled={!dirty || prefsLoading}
              >
                Save preferences
              </Button>
            }
          />

          {prefsLoading ? (
            <div className="divide-y divide-line">
              {Array.from({ length: NOTIFICATION_CATEGORIES.length }).map((_, index) => (
                <div key={index} className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
                  <div className="space-y-2">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                  <Skeleton className="h-5 w-24" />
                </div>
              ))}
            </div>
          ) : prefsError ? (
            <ErrorState
              error={prefsError}
              title="Could not load preferences"
              onRetry={() => void reloadPrefs()}
              className="py-12"
            />
          ) : (
            <>
              <div className="divide-y divide-line">
                {draft.map((preference) => {
                  const meta = NOTIFICATION_CATEGORY_META[preference.category]
                  return (
                    <div
                      key={preference.category}
                      className="flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div className="min-w-0 lg:max-w-md">
                        <div className="flex items-center gap-2">
                          <StatusDot tone={meta.tone} />
                          <p className="text-[13px] font-semibold text-ink">{meta.label}</p>
                        </div>
                        <p className="mt-0.5 text-[12px] leading-4 text-ink-muted">
                          {meta.description}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                        <Switch
                          label="Email"
                          checked={preference.email}
                          onCheckedChange={(checked) =>
                            updatePreference(preference.category, { email: checked })
                          }
                          className="items-center gap-3"
                        />
                        <Switch
                          label="In-app"
                          checked={preference.inApp}
                          onCheckedChange={(checked) =>
                            updatePreference(preference.category, { inApp: checked })
                          }
                          className="items-center gap-3"
                        />
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] text-ink-muted">Digest</span>
                          <Select
                            aria-label={`Digest frequency for ${meta.label}`}
                            className="h-8 w-[148px] text-[12.5px]"
                            value={preference.digest}
                            options={DIGEST_OPTIONS}
                            onChange={(event) =>
                              updatePreference(preference.category, {
                                digest: event.target.value as DigestFrequency,
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-subtle/60 px-5 py-3.5">
                <p className="text-[12px] text-ink-muted">
                  {dirty
                    ? 'You have unsaved changes.'
                    : 'All preferences are saved and up to date.'}
                </p>
                <Button
                  size="sm"
                  onClick={() => void handleSave()}
                  loading={saving}
                  disabled={!dirty}
                >
                  Save preferences
                </Button>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  )
}
