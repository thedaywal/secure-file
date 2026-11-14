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
      setRemaining((current) => (current <= 1 ? 0 : current - 1))
    }, 1000)

    return () => window.clearInterval(interval)
  }, [seconds])

  // Fire the expiry callback from an effect, never from inside the state updater:
  // an updater may run twice (React StrictMode) and must stay side-effect free.
  useEffect(() => {
    if (seconds === null || remaining > 0) return
    onExpireRef.current?.()
  }, [remaining, seconds])

  return remaining
}
