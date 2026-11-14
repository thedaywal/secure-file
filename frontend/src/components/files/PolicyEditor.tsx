import type { ReactNode } from 'react'
import { KeyRound, Lock, MonitorSmartphone, ShieldCheck, Stamp } from 'lucide-react'

import { Card, CardBody, CardHeader, Input, Slider, Switch } from '@/components/common'
import { WatermarkConfigPreview } from '@/components/watermark/WatermarkPreview'
import { formatDateTime, toDateTimeLocalValue } from '@/utils/format'
import { WATERMARK_PATTERN_LABEL } from '@/utils/labels'
import { ACCESS_MODEL_NOTICE, WATERMARK_LOCK_NOTICE } from '@/utils/policy'
import { WATERMARK_PATTERN } from '@/types'
import type {
  AccessControlPolicy,
  DeviceControlPolicy,
  FilePolicy,
  WatermarkConfig,
} from '@/types'

/* ------------------------------------------------------------------ *
 * Policy summary — built from the policy object so the review step and
 * the overview tab never drift from the editor.
 * ------------------------------------------------------------------ */
export type PolicySettingStatus =
  | { kind: 'toggle'; on: boolean }
  | { kind: 'value'; text: string }

export interface PolicySummaryRow {
  label: string
  status: PolicySettingStatus
}

export interface PolicySummarySection {
  id: string
  title: string
  rows: PolicySummaryRow[]
}

const toggle = (on: boolean): PolicySettingStatus => ({ kind: 'toggle', on })
const value = (text: string): PolicySettingStatus => ({ kind: 'value', text })

export function buildPolicySummary(policy: FilePolicy): PolicySummarySection[] {
  const { access, device, viewing, watermark } = policy
  return [
    {
      id: 'access',
      title: 'Access control',
      rows: [
        { label: 'Image-specific credentials', status: toggle(access.recipientCredentials) },
        { label: 'Single-use link', status: toggle(access.singleUseLink) },
        { label: 'One authorized session', status: toggle(access.singleActiveSession) },
        { label: 'Administrator revocation', status: toggle(access.adminRevocation) },
        {
          label: 'Session duration',
          status: value(`${access.sessionDurationMinutes} minutes`),
        },
        {
          label: 'Link expiration',
          status: access.expiresAt ? value(formatDateTime(access.expiresAt)) : value('No expiration'),
        },
      ],
    },
    {
      id: 'device',
      title: 'Device evidence',
      rows: [
        { label: 'Record device metadata', status: toggle(device.recordDeviceMetadata) },
        { label: 'Flag unexpected devices', status: toggle(device.flagUnexpectedDevice) },
      ],
    },
    {
      id: 'viewing',
      title: 'Viewing restrictions',
      rows: [
        { label: 'Download controls disabled', status: toggle(viewing.disableDownloadControls) },
        { label: 'Print controls disabled', status: toggle(viewing.disablePrintControls) },
        { label: 'Browser-only viewing', status: toggle(viewing.browserViewingOnly) },
        { label: 'Permanent watermark (enforced)', status: toggle(viewing.permanentWatermark) },
      ],
    },
    {
      id: 'watermark',
      title: 'Watermark configuration',
      rows: [
        { label: 'Recipient username', status: toggle(watermark.recipientUsername) },
        { label: 'Pattern', status: value(WATERMARK_PATTERN_LABEL[watermark.pattern]) },
        { label: 'Opacity', status: value(`${Math.round(watermark.opacity * 100)}%`) },
        { label: 'Size', status: value(`${watermark.size.toFixed(2)}×`) },
      ],
    },
  ]
}

/** Representative watermark lines used by the configuration preview. */
export function watermarkPreviewLines(config: WatermarkConfig): string[] {
  return config.recipientUsername ? ['amara.okafor'] : ['SecureFile']
}

function ToggleItem({ children }: { children: ReactNode }) {
  return <div className="py-3.5 first:pt-0 last:pb-0">{children}</div>
}

function ToggleList({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-line">{children}</div>
}

export interface PolicyEditorProps {
  policy: FilePolicy
  onChange: (policy: FilePolicy) => void
  errors?: Record<string, string>
}

/**
 * The protection-policy editor shared by the "Protect a file" wizard and the
 * file detail page. Every control is client-side UX only — the backend
 * re-validates the payload. The access model and permanent watermarking are
 * fixed and shown to the administrator as locked.
 */
export function PolicyEditor({ policy, onChange, errors = {} }: PolicyEditorProps) {
  const { access, device, watermark } = policy

  const updateAccess = (patch: Partial<AccessControlPolicy>) =>
    onChange({ ...policy, access: { ...access, ...patch } })
  const updateDevice = (patch: Partial<DeviceControlPolicy>) =>
    onChange({ ...policy, device: { ...device, ...patch } })
  const updateWatermark = (patch: Partial<WatermarkConfig>) =>
    onChange({ ...policy, watermark: { ...watermark, ...patch } })

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          icon={<KeyRound size={16} />}
          title="Access control"
          description="How a recipient proves identity and how the single-use link behaves."
        />
        <CardBody>
          <ToggleList>
            <ToggleItem>
              <Switch
                label="Image-specific credentials"
                description="Each recipient authenticates with a username and password created for this image only."
                checked
                locked
                onCheckedChange={() => undefined}
              />
            </ToggleItem>
            <ToggleItem>
              <Switch
                label="Single-use link"
                description="The link is atomically consumed on the first successful authentication and can never be reused."
                checked
                locked
                onCheckedChange={() => undefined}
              />
            </ToggleItem>
            <ToggleItem>
              <Switch
                label="One authorized session"
                description="Exactly one browser session may exist per consumed link."
                checked
                locked
                onCheckedChange={() => undefined}
              />
            </ToggleItem>
            <ToggleItem>
              <Switch
                label="Administrator revocation"
                description="You may revoke the link or the active session at any time."
                checked
                locked
                onCheckedChange={() => undefined}
              />
            </ToggleItem>
            <ToggleItem>
              <Input
                className="max-w-[220px]"
                type="number"
                min={1}
                label="Session duration (minutes)"
                value={String(access.sessionDurationMinutes)}
                onChange={(event) =>
                  updateAccess({
                    sessionDurationMinutes: Math.max(1, Number(event.target.value) || 1),
                  })
                }
                error={errors['access.sessionDurationMinutes'] ?? null}
              />
            </ToggleItem>
            <ToggleItem>
              <Switch
                label="Set an expiration date"
                description="The link is automatically marked expired once the date passes."
                checked={access.expiresAt !== null}
                onCheckedChange={(checked) =>
                  updateAccess({
                    expiresAt: checked
                      ? new Date(Date.now() + 7 * 86_400_000).toISOString()
                      : null,
                  })
                }
              />
              {access.expiresAt !== null ? (
                <Input
                  className="mt-3 max-w-[260px]"
                  type="datetime-local"
                  label="Expires at"
                  value={toDateTimeLocalValue(new Date(access.expiresAt))}
                  onChange={(event) =>
                    updateAccess({
                      expiresAt: event.target.value
                        ? new Date(event.target.value).toISOString()
                        : null,
                    })
                  }
                  error={errors['access.expiresAt'] ?? null}
                />
              ) : null}
            </ToggleItem>
          </ToggleList>
          <p className="mt-4 flex items-start gap-1.5 text-[12px] leading-4 text-warning-700">
            <Lock size={13} className="mt-0.5 shrink-0" aria-hidden />
            {ACCESS_MODEL_NOTICE}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={<MonitorSmartphone size={16} />}
          title="Device evidence"
          description="Devices are recorded as audit evidence — they are not an authentication factor."
        />
        <CardBody>
          <ToggleList>
            <ToggleItem>
              <Switch
                label="Record device metadata"
                description="Device, browser and OS metadata are captured alongside every session."
                checked
                locked
                onCheckedChange={() => undefined}
              />
            </ToggleItem>
            <ToggleItem>
              <Switch
                label="Flag unexpected devices"
                description="Raise an alert when a consumed link reappears from a device that never held the session."
                checked={device.flagUnexpectedDevice}
                onCheckedChange={(checked) => updateDevice({ flagUnexpectedDevice: checked })}
              />
            </ToggleItem>
          </ToggleList>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={<ShieldCheck size={16} />}
          title="Viewing restrictions"
          description="The backend enforces these for every protected image request."
        />
        <CardBody>
          <ToggleList>
            <ToggleItem>
              <Switch
                label="Disable download controls"
                description="No ordinary download affordance is exposed to the recipient."
                checked
                locked
                onCheckedChange={() => undefined}
              />
            </ToggleItem>
            <ToggleItem>
              <Switch
                label="Disable print controls"
                description="No print affordance is exposed to the recipient."
                checked
                locked
                onCheckedChange={() => undefined}
              />
            </ToggleItem>
            <ToggleItem>
              <Switch
                label="Browser-only viewing"
                description="Content is delivered only through the protected browser viewer."
                checked
                locked
                onCheckedChange={() => undefined}
              />
            </ToggleItem>
            <ToggleItem>
              <Switch
                label="Permanent recipient watermark"
                description="Embedded into the generated image pixels by the backend."
                checked
                locked
                onCheckedChange={() => undefined}
              />
            </ToggleItem>
          </ToggleList>
          <p className="mt-4 flex items-start gap-1.5 text-[12px] leading-4 text-warning-700">
            <Lock size={13} className="mt-0.5 shrink-0" aria-hidden />
            {WATERMARK_LOCK_NOTICE} Download and print restrictions are a strong deterrent, not an
            absolute guarantee — a determined recipient can still photograph a screen.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={<Stamp size={16} />}
          title="Watermark configuration"
          description="The recipient username is always embedded, repeated diagonally across the entire image in bold black ink."
        />
        <CardBody>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <ToggleList>
                <ToggleItem>
                  <Switch
                    label="Recipient username"
                    checked
                    locked
                    onCheckedChange={() => undefined}
                  />
                </ToggleItem>
              </ToggleList>

              <div className="rounded-lg border border-line bg-surface-subtle/60 px-3.5 py-3">
                <p className="text-[12px] text-ink-muted">Pattern</p>
                <p className="mt-0.5 text-[13px] font-medium text-ink">
                  {WATERMARK_PATTERN_LABEL[WATERMARK_PATTERN]}
                </p>
              </div>

              <Slider
                label="Opacity"
                min={0.05}
                max={0.9}
                step={0.01}
                value={watermark.opacity}
                onChange={(next) => updateWatermark({ opacity: next })}
                formatValue={(next) => `${Math.round(next * 100)}%`}
                hint="Controls how strongly the black watermark is embedded. Choose 5%–90%."
                id="watermark-opacity"
              />

              <Slider
                label="Size"
                min={0.5}
                max={2}
                step={0.05}
                value={watermark.size}
                onChange={(next) => updateWatermark({ size: next })}
                formatValue={(next) => `${next.toFixed(2)}×`}
                id="watermark-size"
              />
            </div>

            <WatermarkConfigPreview
              lines={watermarkPreviewLines(watermark)}
              opacity={watermark.opacity}
              size={watermark.size}
              height={340}
            />
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
