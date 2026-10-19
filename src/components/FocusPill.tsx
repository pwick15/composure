import { AnimatePresence, motion } from 'motion/react'
import { keepFocus, SNAP } from '../lib/motion'
import { openInSession } from '../lib/selectors'
import { activeId, clock, leftovers, remainingMs, sessionNow, taskClock, windowOf } from '../lib/session'
import { useNow } from '../lib/useNow'
import { sessionStop, setMode, truncate } from '../state/actions'
import { useStore } from '../state/store'

/** The running work session, visible on every screen: time left in it, and what you're on. */
export function FocusPill() {
  const run = useStore((s) => s.run)
  const items = useStore((s) => s.items)
  const now = sessionNow(run, useNow(run?.phase === 'running' ? 1000 : null))

  const today = useStore((s) => s.today)
  const open = new Set(run ? openInSession(items, today, run.session).map((i) => i.id) : [])
  const win = run ? windowOf(run, items) : null
  const t = run ? taskClock(run, now) : now
  const pct = win ? Math.min(1, Math.max(0, (t - win.start) / win.ms)) : run ? 1 : 0
  const active = run ? items.find((i) => i.id === activeId(run)) : undefined
  const left = run?.phase === 'over' ? leftovers(run, open).length : 0

  return (
    <AnimatePresence>
      {run && (
        <motion.button
          className="focus-pill"
          data-over={run.phase === 'over' || undefined}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={SNAP}
          onMouseDown={keepFocus}
          onClick={(e) => (e.altKey ? sessionStop() : setMode('today'))}
          title="Work session. Click to open Today, ⌥-click to stop"
        >
          <svg className="focus-pill__ring" viewBox="0 0 20 20" aria-hidden>
            <circle cx="10" cy="10" r="8" />
            <circle cx="10" cy="10" r="8" style={{ strokeDashoffset: 50.27 * (1 - pct) }} />
          </svg>
          <span className="focus-pill__time">
            {run.phase === 'over' ? "time's up" : clock(remainingMs(run, items, open, t))}
          </span>
          <span className="focus-pill__text">
            {run.phase === 'over' ? `${left} not finished` : run.pause ? `paused: ${truncate(run.pause.label, 16)}` : active ? truncate(active.text, 22) : ''}
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  )
}
