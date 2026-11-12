import { useCallback, useState } from 'react'

export interface PaginationState {
  page: number
  pageSize: number
  setPage: (page: number) => void
  setPageSize: (pageSize: number) => void
  /** Returns to page 1 — call whenever filters or search terms change. */
  reset: () => void
}

export function usePagination(initialPageSize = 10): PaginationState {
  const [page, setPageState] = useState(1)
  const [pageSize, setPageSizeState] = useState(initialPageSize)

  const setPage = useCallback((next: number) => setPageState(Math.max(1, next)), [])

  const setPageSize = useCallback((next: number) => {
    setPageSizeState(next)
    setPageState(1)
  }, [])

  const reset = useCallback(() => setPageState(1), [])

  return { page, pageSize, setPage, setPageSize, reset }
}
