import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { setAccessToken, setUnauthorizedHandler } from '@/services/api'
import { authService } from '@/services/auth.service'
import type { AuthSession, LoginPayload, User } from '@/types'

export type AuthStatus = 'initialising' | 'authenticated' | 'unauthenticated'

interface AuthContextValue {
  user: User | null
  status: AuthStatus
  isAuthenticated: boolean
  login: (payload: LoginPayload) => Promise<void>
  logout: () => Promise<void>
  updateUser: (patch: Partial<User>) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Session persistence.
 *
 * The access token is held in memory by the API client. For local development
 * we keep a session snapshot in `sessionStorage` (cleared when the tab closes)
 * so a refresh does not sign the operator out. In production the refresh token
 * should be issued as an httpOnly, SameSite=Strict cookie by Django and never
 * be readable from JavaScript.
 */
const SESSION_KEY = 'securefile:session'

function readSession(): AuthSession | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AuthSession
    if (!parsed?.user?.id || !parsed?.tokens?.accessToken) return null
    return parsed
  } catch {
    return null
  }
}

function writeSession(session: AuthSession | null): void {
  try {
    if (session) {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } else {
      window.sessionStorage.removeItem(SESSION_KEY)
    }
  } catch {
    /* storage unavailable — the session simply becomes memory-only */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>('initialising')
  const mounted = useRef(true)

  const applySession = useCallback((session: AuthSession) => {
    setAccessToken(session.tokens.accessToken)
    writeSession(session)
    setUser(session.user)
    setStatus('authenticated')
  }, [])

  const clearSession = useCallback(() => {
    setAccessToken(null)
    writeSession(null)
    setUser(null)
    setStatus('unauthenticated')
  }, [])

  useEffect(() => {
    mounted.current = true

    const existing = readSession()
    if (existing) {
      setAccessToken(existing.tokens.accessToken)
      setUser(existing.user)
      setStatus('authenticated')

      // Re-validate the session in the background; a 401 clears it.
      authService
        .me()
        .then((fresh) => {
          if (mounted.current) setUser(fresh)
        })
        .catch(() => {
          if (mounted.current) clearSession()
        })
    } else {
      setStatus('unauthenticated')
    }

    return () => {
      mounted.current = false
    }
  }, [clearSession])

  useEffect(() => {
    setUnauthorizedHandler(() => clearSession())
    return () => setUnauthorizedHandler(null)
  }, [clearSession])

  const login = useCallback(
    async (payload: LoginPayload) => {
      const session = await authService.login(payload)
      applySession(session)
    },
    [applySession],
  )

  const logout = useCallback(async () => {
    try {
      await authService.logout()
    } catch {
      /* sign-out must succeed locally even if the API call fails */
    } finally {
      clearSession()
    }
  }, [clearSession])

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser((current) => {
      if (!current) return current
      const next = { ...current, ...patch }
      const existing = readSession()
      if (existing) writeSession({ ...existing, user: next })
      return next
    })
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      isAuthenticated: status === 'authenticated',
      login,
      logout,
      updateUser,
    }),
    [user, status, login, logout, updateUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.')
  return context
}
