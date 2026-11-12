import { request, withMockFallback } from '@/services/api'
import * as mock from '@/services/mock'
import type { AuthSession, LoginPayload, User } from '@/types'

/**
 * Administrator authentication endpoints.
 *
 * SecureFile is a single-administrator platform: there is no public
 * registration, no email verification, no OTP and no MFA. The backend owns
 * password hashing (Argon2) and session lifetime. The frontend never stores
 * plaintext credentials and keeps the access token in memory only (see
 * `src/services/api.ts`).
 */
export const authService = {
  login(payload: LoginPayload): Promise<AuthSession> {
    return withMockFallback(
      () =>
        request<AuthSession>({
          url: '/auth/login/',
          method: 'POST',
          data: {
            email: payload.email,
            password: payload.password,
            remember: payload.remember,
          },
        }),
      () => mock.mockLogin(payload.email),
    )
  },

  forgotPassword(email: string): Promise<void> {
    return withMockFallback(
      () => request<void>({ url: '/auth/forgot-password/', method: 'POST', data: { email } }),
      () => mock.mockNoop(),
    )
  },

  resetPassword(token: string, password: string): Promise<void> {
    return withMockFallback(
      () =>
        request<void>({
          url: '/auth/reset-password/',
          method: 'POST',
          data: { token, password },
        }),
      () => mock.mockNoop(),
    )
  },

  logout(): Promise<void> {
    return withMockFallback(
      () => request<void>({ url: '/auth/logout/', method: 'POST' }),
      () => mock.mockNoop(),
    )
  },

  me(): Promise<User> {
    return withMockFallback(() => request<User>({ url: '/auth/me/', method: 'GET' }), () =>
      mock.mockCurrentUser(),
    )
  },

  /** Persist the administrator's editable profile fields. */
  updateProfile(patch: Partial<User>): Promise<User> {
    return withMockFallback(
      () => request<User>({ url: '/auth/me/', method: 'PATCH', data: patch }),
      () => mock.mockUpdateProfile(patch),
    )
  },

  /** Rotate the administrator password; other sessions are revoked server-side. */
  changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return withMockFallback(
      () =>
        request<void>({
          url: '/auth/change-password/',
          method: 'POST',
          data: { currentPassword, newPassword },
        }),
      () => mock.mockChangePassword(),
    )
  },

  /** Revoke every access and refresh token for the account. */
  revokeAllSessions(): Promise<void> {
    return withMockFallback(
      () => request<void>({ url: '/auth/sessions/revoke-all/', method: 'POST' }),
      () => mock.mockRevokeAllSessions(),
    )
  },
}
