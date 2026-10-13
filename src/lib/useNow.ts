import { useEffect, useState } from 'react'

/** The current time, re-read every `ms` (or never, when `ms` is null). */
export function useNow(ms: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (ms === null) return
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}
