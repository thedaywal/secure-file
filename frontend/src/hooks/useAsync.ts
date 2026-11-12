import { useCallback, useEffect, useRef, useState } from 'react'

import { toApiError } from '@/services/api'
import type { ApiError } from '@/types'

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: ApiError | null
}

export interface UseAsyncResult<T> extends AsyncState<T> {
  /** Re-runs the request, optionally with a pending/optimistic override. */
  reload: (options?: { silent?: boolean }) => Promise<T | null>
  setData: (updater: T | ((current: T | null) => T | null)) => void
  reset: () => void
}

/**
 * Minimal data-fetching hook: tracks loading/error state, cancels stale
 * responses and normalises every failure into the shared `ApiError` shape.
 */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
  options: { immediate?: boolean; initialData?: T | null } = {},
): UseAsyncResult<T> {
  const { immediate = true, initialData = null } = options
  const [state, setState] = useState<AsyncState<T>>({
    data: initialData,
    loading: immediate,
    error: null,
  })
  const requestId = useRef(0)
  const mounted = useRef(true)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run = useCallback(async (silent = false): Promise<T | null> => {
    requestId.current += 1
    const currentRequest = requestId.current
    if (!silent) setState((previous) => ({ ...previous, loading: true, error: null }))

    try {
      const data = await fnRef.current()
      if (mounted.current && currentRequest === requestId.current) {
        setState({ data, loading: false, error: null })
      }
      return data
    } catch (error) {
      const apiError = toApiError(error)
      if (mounted.current && currentRequest === requestId.current) {
        setState({ data: null, loading: false, error: apiError })
      }
      return null
    }
  }, [])

  useEffect(() => {
    if (immediate) void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  const setData = useCallback((updater: T | ((current: T | null) => T | null)) => {
    setState((previous) => ({
      ...previous,
      data:
        typeof updater === 'function'
          ? (updater as (current: T | null) => T | null)(previous.data)
          : updater,
    }))
  }, [])

  const reset = useCallback(() => {
    setState({ data: initialData, loading: false, error: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    ...state,
    reload: (reloadOptions) => run(reloadOptions?.silent ?? false),
    setData,
    reset,
  }
}
