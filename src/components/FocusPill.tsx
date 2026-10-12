import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { keepFocus, SNAP } from '../lib/motion'
import { focusFinished, focusStop, setMode, truncate } from '../state/actions'
import { useStore } from '../state/store'

const pad = (n: number) => String(n).padStart(2, '0')

/** The running focus block, visible on every screen. Click to stop. */
export function FocusPill() {
  const focus = useStore((s) => s.focus)
  const item = useStore((s) => s.items.find((i) => i.id === s.focus?.id))
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!focus) return
    const tick = () => {
      const t = Date.now()
      setNow(t)
      if (t >= focus.endsAt) focusFinished()
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [focus])

  const left = focus ? Math.max(0, focus.endsAt - now) : 0
  const pct = focus ? 1 - left / (focus.minutes * 60_000) : 0

  return (
    <AnimatePresence>
      {focus && (
        <motion.button
          className="focus-pill"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={SNAP}
          onMouseDown={keepFocus}
          onClick={(e) => (e.altKey ? focusStop() : setMode('today'))}
          title="Focus block. Click to open Today, ⌥-click to stop"
        >
          <svg className="focus-pill__ring" viewBox="0 0 20 20" aria-hidden>
            <circle cx="10" cy="10" r="8" />
            <circle cx="10" cy="10" r="8" style={{ strokeDashoffset: 50.27 * (1 - pct) }} />
          </svg>
          <span className="focus-pill__time">
            {pad(Math.floor(left / 60_000))}:{pad(Math.floor((left % 60_000) / 1000))}
          </span>
          {item && <span className="focus-pill__text">{truncate(item.text, 22)}</span>}
        </motion.button>
      )}
    </AnimatePresence>
  )
}
