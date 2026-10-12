import { AnimatePresence, motion } from 'motion/react'
import { SNAP } from '../lib/motion'
import { useStore } from '../state/store'
import { Kbd } from './Kbd'

export function Toasts() {
  const toasts = useStore((s) => s.toasts)
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            className="toast"
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, transition: { duration: 0.14 } }}
            transition={SNAP}
          >
            {t.text}
            {t.keys && <Kbd k={t.keys} size="xs" />}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
