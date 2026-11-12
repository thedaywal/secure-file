import type { FilePolicy, RecipientPermissions } from '@/types'

/**
 * Secure-by-default protection policy applied when an image is uploaded.
 *
 * The access model is deliberately rigid: image-specific credentials, a
 * single-use link, exactly one active session and administrator revocation are
 * literal `true` in the type system and can never be switched off from the
 * client. `permanentWatermark` is locked in the same way.
 */
export function createDefaultPolicy(): FilePolicy {
  return {
    access: {
      recipientCredentials: true,
      singleUseLink: true,
      singleActiveSession: true,
      adminRevocation: true,
      sessionDurationMinutes: 60,
      expiresAt: null,
    },
    device: {
      recordDeviceMetadata: true,
      flagUnexpectedDevice: true,
    },
    viewing: {
      disableDownloadControls: true,
      disablePrintControls: true,
      browserViewingOnly: true,
      permanentWatermark: true,
    },
    watermark: {
      recipientUsername: true,
      accessTimestamp: true,
      secureFileReference: true,
      pattern: 'repeated-diagonal',
      opacity: 0.18,
      size: 1,
    },
  }
}

export function createDefaultPermissions(): RecipientPermissions {
  return {
    canView: true,
    sessionDurationMinutes: 60,
    expiresAt: null,
  }
}

export const WATERMARK_LOCK_NOTICE =
  'Permanent watermarking is enforced by the backend and cannot be disabled.'

export const ACCESS_MODEL_NOTICE =
  'Credentials are image-specific. The link is consumed on first successful authentication and ' +
  'only one authorized browser session may exist per link.'

/**
 * Client-side validation is a UX affordance only — the backend re-validates
 * every policy before it accepts a protection request.
 */
export function validatePolicy(policy: FilePolicy): Record<string, string> {
  const errors: Record<string, string> = {}

  if (
    !Number.isFinite(policy.access.sessionDurationMinutes) ||
    policy.access.sessionDurationMinutes < 1
  ) {
    errors['access.sessionDurationMinutes'] = 'Session duration must be at least 1 minute.'
  }

  if (policy.access.expiresAt && new Date(policy.access.expiresAt).getTime() <= Date.now()) {
    errors['access.expiresAt'] = 'Expiration date must be in the future.'
  }

  if (policy.watermark.opacity < 0.05 || policy.watermark.opacity > 0.5) {
    errors['watermark.opacity'] = 'Watermark opacity must be between 5% and 50%.'
  }

  if (!policy.viewing.permanentWatermark) {
    errors['viewing.permanentWatermark'] = WATERMARK_LOCK_NOTICE
  }

  return errors
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function isEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim())
}

/** Image-specific recipient usernames and passwords are exactly 10 digits. */
export const USERNAME_PATTERN = /^\d{10}$/

export function isUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value.trim())
}

export function validateUsername(value: string): string | null {
  const username = value.trim()
  if (!username) return 'Enter the recipient username.'
  if (!isUsername(username)) {
    return 'The recipient username must be exactly 10 digits.'
  }
  return null
}

export const PASSWORD_MIN_LENGTH = 10

export function validateRecipientPassword(value: string): string | null {
  if (!value) return 'Assign a password for the recipient.'
  if (!/^\d{10}$/.test(value)) return 'The recipient password must be exactly 10 digits.'
  return null
}
