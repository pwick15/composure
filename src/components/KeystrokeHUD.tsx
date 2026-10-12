import { AnimatePresence, motion } from 'motion/react'
import { useSyncExternalStore } from 'react'
import { hudStore } from '../keyboard/feedback'
import { SNAP } from '../lib/motion'
import { useStore } from '../state/store'

/** KeyCastr-style overlay: every handled key press shows up bottom-right for a moment. */
export function KeystrokeHUD() {
  const enabled = useStore((s) => s.hud)
  const entries = useSyncExternalStore(hudStore.subscribe, hudStore.get)
  if (!enabled) return null
  return (
    <div className="hud" aria-hidden>
      <AnimatePresence initial={false}>
        {entries.map((e) => (
          <motion.div
            key={e.id}
            layout
            className="hud__item"
            initial={{ opacity: 0, y: 14, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.16 } }}
            transition={SNAP}
          >
            <span className="hud__keys">
              {e.keys.map((k, i) => (
                <kbd key={i} className="kbd kbd--md">
                  {k}
                </kbd>
              ))}
            </span>
            <span className="hud__label">{e.label}</span>
            {e.count > 1 && (
              <motion.span key={e.count} className="hud__count" initial={{ scale: 1.5 }} animate={{ scale: 1 }} transition={SNAP}>
                ×{e.count}
              </motion.span>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
