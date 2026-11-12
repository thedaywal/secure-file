import { useEffect } from 'react'

const SUFFIX = 'SecureFile — Protected Document Delivery'

export function useDocumentTitle(title?: string): void {
  useEffect(() => {
    document.title = title ? `${title} · SecureFile` : SUFFIX
  }, [title])
}
