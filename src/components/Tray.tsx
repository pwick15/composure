import { AnimatePresence, motion, type Variants } from 'motion/react'
import type { CSSProperties, ReactNode } from 'react'
import { SPRING } from '../lib/motion'
import type { Item } from '../lib/types'
import { truncate } from '../state/actions'
import { useStore, type TrayExit } from '../state/store'
import { Kbd } from './Kbd'
import { ParentRef } from './Tags'

/** What the last filing key did, shown beside the progress with the way back. */
export interface Receipt {
  item: Item
  label: string
  /** A quadrant id, or "accent" for days. */
  tone: string
}

interface TrayProps {
  label: string
  done: number
  total: number
  current: Item | null
  /** How many more thoughts wait in the queue behind the current one. */
  ahead: number
  tags: ReactNode
  idle: ReactNode
  empty: ReactNode
  receipt: Receipt | null
}

const variants: Variants = {
  enter: { opacity: 0, scale: 0.96, y: 16 },
  center: { opacity: 1, scale: 1, x: 0, y: 0, transition: SPRING },
  exit: (d: TrayExit) => ({
    opacity: 0,
    scale: 0.88,
    x: d.x * 140,
    y: d.y * 70,
    transition: { duration: 0.2, ease: [0.4, 0, 0.9, 0.6] },
  }),
}

export function Tray({ label, done, total, current, ahead, tags, idle, empty, receipt }: TrayProps) {
  const exit = useStore((s) => s.trayExit)
  const pct = total ? (done / total) * 100 : 0

  return (
    <section className="tray">
      <div className="tray__rail">
        <span className="eyebrow">{label}</span>
        <div className="progress" aria-hidden>
          <motion.div className="progress__fill" initial={false} animate={{ width: `${pct}%` }} />
        </div>
        <span className="tray__count">
          {done}/{total}
        </span>
        <div className="tray__receipt" aria-live="polite">
          <AnimatePresence mode="popLayout" initial={false}>
            {receipt && (
              <motion.span
                key={`${receipt.item.id}:${receipt.label}`}
                className="receipt"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4, transition: { duration: 0.1 } }}
              >
                <span className="receipt__text">"{truncate(receipt.item.text, 28)}"</span>
                <span className="receipt__arrow">→</span>
                <span className="receipt__dest" data-q={receipt.tone}>
                  {receipt.label}
                </span>
                <span className="receipt__back">
                  <Kbd k="backspace" size="xs" /> back
                </span>
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* The card sits in the flow, so the tray is as tall as the thought needs. */}
      <div className="tray__stage">
        {Array.from({ length: Math.min(ahead, 2) }, (_, i) => (
          <div key={i} className="tray__peek" style={{ '--i': i + 1 } as CSSProperties} />
        ))}
        <AnimatePresence custom={exit} initial={false} mode="popLayout">
          {current ? (
            <motion.article
              key={current.id}
              className="card"
              custom={exit}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
            >
              <div className="card__inner">
                <div className="card__top">
                  {tags}
                  <ParentRef item={current} className="parent-ref--card" />
                </div>
                <p className="card__text">{current.text}</p>
                <div className="card__foot">
                  <span className="card__idle">{idle}</span>
                </div>
              </div>
            </motion.article>
          ) : (
            <motion.div
              key="empty"
              className="card card--empty"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
            >
              {empty}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}
