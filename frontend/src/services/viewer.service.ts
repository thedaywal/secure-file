import { loadMock, request, withMockFallback } from '@/services/api'
import { env } from '@/config/env'
import type { ViewerLinkContext, ViewerSession, ViewerViewEvent } from '@/types'

/**
 * PUBLIC recipient endpoints — no dashboard access, no administrator data.
 *
 * Security model honoured by this module (all enforced by the backend):
 *  - resolving a token only reveals *whether* the link is usable; opening a
 *    link never consumes it;
 *  - `authenticate` submits the image-specific username + password and is the
 *    only operation that atomically consumes the link. A failed authentication
 *    leaves the link ACTIVE;
 *  - the returned session is bound to this browser via a Secure, HttpOnly,
 *    SameSite cookie; a consumed link can never open a second session;
 *  - callers cannot request the encrypted original — the API only ever returns
 *    a short-lived, recipient-scoped, permanently watermarked image;
 *  - every state transition is logged server-side for the access monitor.
 */
export const viewerService = {
  /** Reads the link state without consuming it. */
  resolveToken(token: string): Promise<ViewerLinkContext> {
    return withMockFallback(
      () => request<ViewerLinkContext>({ url: `/public/links/${token}/`, method: 'GET' }),
      async () => (await loadMock()).mockResolveViewerToken(token),
    )
  },

  /**
   * The single operation that consumes the link. On success the backend marks
   * the link CONSUMED, opens exactly one authorized session and returns the
   * personalized watermarked rendition.
   */
  authenticate(token: string, username: string, password: string): Promise<ViewerSession> {
    return withMockFallback(
      () =>
        request<ViewerSession>({
          url: `/public/links/${token}/authenticate/`,
          method: 'POST',
          data: { username, password },
        }),
      async () => (await loadMock()).mockAuthenticateViewer(token, username, password),
    )
  },

  /** Resume an already-authorized session from its HttpOnly session cookie. */
  currentSession(token: string): Promise<ViewerSession> {
    return withMockFallback(
      () => request<ViewerSession>({ url: `/public/links/${token}/session/`, method: 'GET' }),
      async () => (await loadMock()).mockGetViewerSession(token),
    )
  },

  /** Server-issued session heartbeat; enforces the viewing-session deadline. */
  heartbeat(sessionId: string): Promise<{ remainingSeconds: number }> {
    return withMockFallback(
      () =>
        request<{ remainingSeconds: number }>({
          url: `/public/sessions/${sessionId}/heartbeat/`,
          method: 'POST',
        }),
      async () => (await loadMock()).mockViewerHeartbeat(sessionId),
    )
  },

  /**
   * End the viewing session immediately. Called from `pagehide` and
   * `visibilitychange` so the session ends the moment the recipient minimises
   * the browser or leaves the page. `sendBeacon` is the only transport that
   * reliably survives page teardown, so there is no response to await — the
   * backend also abandons a session whose heartbeat stops, which covers a
   * beacon that never arrives.
   */
  closeSession(sessionId: string): void {
    const url = `${env.apiBaseUrl}/public/sessions/${sessionId}/close/`
    if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(url)) return
    void fetch(url, { method: 'POST', keepalive: true, credentials: 'include' })
  },

  recordEvent(sessionId: string, payload: ViewerViewEvent): Promise<void> {
    return withMockFallback(
      () =>
        request<void>({
          url: `/public/sessions/${sessionId}/events/`,
          method: 'POST',
          data: payload,
        }),
      async () => (await loadMock()).mockLogViewerEvent(),
    )
  },
}
