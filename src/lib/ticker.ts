/**
 * Calls `fn` every second, even in a background tab. Browsers slow page timers right down for tabs
 * you aren't looking at (to once a minute), which would make "time's up" arrive late; a worker's
 * clock keeps going. Falls back to a plain interval where workers aren't available.
 */
export function startTicker(fn: () => void, ms = 1000): () => void {
  try {
    const url = URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${ms})`], { type: 'text/javascript' }))
    const worker = new Worker(url)
    worker.onmessage = fn
    return () => {
      worker.terminate()
      URL.revokeObjectURL(url)
    }
  } catch {
    const id = setInterval(fn, ms)
    return () => clearInterval(id)
  }
}
