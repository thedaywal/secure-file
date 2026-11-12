import { useEffect, useRef, useState } from 'react'

/**
 * Counts down to zero. `seconds === null` pauses the timer.
 * Used by the public viewer to enforce the viewing-session deadline.
 */
export function useCountdown(seconds: number | null, onExpire?: () => void) {
  const [remaining, setRemaining] = useState(seconds ?? 0)
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  useEffect(() => {
    setRemaining(seconds ?? 0)
    if (seconds === null) return

    const interval = window.setInterval(() => {
      setRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(interval)
          onExpireRef.current?.()
          return 0
        }
        return current - 1
      })
    }, 1000)

    return () => window.clearInterval(interval)
  }, [seconds])

  return remaining
}
