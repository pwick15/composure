import { useEffect } from 'react'
import { todayKey } from '../lib/dates'
import { openInSession } from '../lib/selectors'
import { activeId, clock, leftovers, remainingMs } from '../lib/session'
import { startTicker } from '../lib/ticker'
import { sessionSync } from '../state/actions'
import { getState, useStore } from '../state/store'

/** The tab title while a session runs, so the countdown shows on the tab itself. */
function titleFor(): string | null {
  const { run, items } = getState()
  if (!run) return null
  const open = new Set(openInSession(items, todayKey(), run.session).map((i) => i.id))
  if (run.phase === 'over') return `Time's up · ${leftovers(run, open).length} left`
  const task = items.find((i) => i.id === activeId(run))
  return `${clock(remainingMs(run, items, open, Date.now()))} · ${task?.text ?? 'Session'}`
}

/**
 * Keeps a running session moving: closes task windows as they run out, even when this tab is in the
 * background, and mirrors the countdown in the tab title. Renders nothing.
 */
export function SessionDriver() {
  const phase = useStore((s) => s.run?.phase ?? null)

  useEffect(() => {
    if (!phase) return
    const original = document.title
    const tick = () => {
      sessionSync()
      document.title = titleFor() ?? original
    }
    tick()
    const stop = phase === 'running' ? startTicker(tick) : () => {}
    document.addEventListener('visibilitychange', tick)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', tick)
      document.title = original
    }
  }, [phase])

  return null
}
