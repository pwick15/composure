import { useEffect } from 'react'
import { todayKey } from '../lib/dates'
import { iconLabel, timerIcon } from '../lib/favicon'
import { openInSession } from '../lib/selectors'
import { activeId, clock, leftovers, remainingMs, taskClock, windowOf } from '../lib/session'
import { startTicker } from '../lib/ticker'
import { sessionSync } from '../state/actions'
import { getState, useStore } from '../state/store'

/** What the tab shows for the running session: a title, and the icon's text and ring. */
function tabState() {
  const { run, items } = getState()
  if (!run) return null
  const now = Date.now()
  const open = new Set(openInSession(items, todayKey(), run.session).map((i) => i.id))
  if (run.phase === 'over') {
    return { title: `Time's up · ${leftovers(run, open).length} left`, icon: { label: '!', progress: 1, over: true } }
  }
  const t = taskClock(run, now)
  const left = remainingMs(run, items, open, t)
  const task = items.find((i) => i.id === activeId(run))
  const win = windowOf(run, items)
  return {
    title: run.pause ? `Paused · ${run.pause.label}` : `${clock(left)} · ${task?.text ?? 'Session'}`,
    icon: { label: run.pause ? '⏸' : iconLabel(left), progress: win ? (t - win.start) / win.ms : 0, over: false },
  }
}

/**
 * Keeps a running session moving: closes task windows as they run out, even when this tab is in the
 * background, and mirrors the countdown on the tab itself (title and icon) so you can read it from
 * any other window. Renders nothing.
 */
export function SessionDriver() {
  const phase = useStore((s) => s.run?.phase ?? null)

  useEffect(() => {
    if (!phase) return
    const originalTitle = document.title
    let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
    if (!link) {
      link = Object.assign(document.createElement('link'), { rel: 'icon' })
      document.head.append(link)
    }
    const originalHref = link.href
    const originalType = link.type
    let drawn = ''

    const tick = () => {
      sessionSync()
      const tab = tabState()
      document.title = tab?.title ?? originalTitle
      if (!tab || !link) return
      // Redraw only when the picture would change: the number, or a visible step of the ring.
      const key = `${tab.icon.label}:${Math.round(tab.icon.progress * 48)}:${tab.icon.over}`
      if (key === drawn) return
      const url = timerIcon(tab.icon)
      if (!url) return
      drawn = key
      link.type = 'image/png'
      link.href = url
    }
    tick()
    const stop = phase === 'running' ? startTicker(tick) : () => {}
    document.addEventListener('visibilitychange', tick)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', tick)
      document.title = originalTitle
      if (link) {
        link.href = originalHref
        link.type = originalType
      }
    }
  }, [phase])

  return null
}
