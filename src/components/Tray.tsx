import { AnimatePresence, motion, type Variants } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { feedback } from '../keyboard/feedback'
import { autosize } from '../lib/dom'
import { SPRING } from '../lib/motion'
import type { Item } from '../lib/types'
import { trayCancel, trayCommit } from '../state/actions'
import { getState, useStore, type TrayExit } from '../state/store'
import { Kbd } from './Kbd'

export interface TrayTarget {
  label: string
  /** A quadrant id, or "accent" for days. */
  tone: string
}

interface TrayProps {
  label: string
  done: number
  total: number
  current: Item | null
  /** How many more items wait behind the current one. */
  ahead: number
  target: TrayTarget | null
  tags: ReactNode
  idle: ReactNode
  empty: ReactNode
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

function TrayEditor({ item }: { item: Item }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current!
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
    autosize(el)
  }, [])
  return (
    <textarea
      ref={ref}
      className="card__input"
      defaultValue={item.text}
      rows={1}
      aria-label="Edit text"
      onInput={(e) => autosize(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          feedback(e.nativeEvent, 'Saved')
          trayCommit(item.id, e.currentTarget.value)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          feedback(e.nativeEvent, 'Cancel')
          trayCancel()
        }
      }}
      onBlur={(e) => {
        if (getState().trayEditing === item.id) trayCommit(item.id, e.currentTarget.value)
      }}
    />
  )
}

export function Tray({ label, done, total, current, ahead, target, tags, idle, empty }: TrayProps) {
  const exit = useStore((s) => s.trayExit)
  const editing = useStore((s) => s.trayEditing)
  const shake = useStore((s) => s.shake)
  const inner = useRef<HTMLDivElement>(null)
  const lastShake = useRef(shake)

  useEffect(() => {
    if (shake === lastShake.current) return
    lastShake.current = shake
    const el = inner.current
    if (!el) return
    el.classList.remove('is-shaking')
    void el.offsetWidth
    el.classList.add('is-shaking')
  }, [shake])

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
      </div>

      <div className="tray__stage">
        {Array.from({ length: Math.min(ahead, 2) }, (_, i) => (
          <div key={i} className="tray__peek" style={{ '--i': i + 1 } as CSSProperties} />
        ))}
        <AnimatePresence custom={exit} initial={false}>
          {current ? (
            <motion.article
              key={current.id}
              className="card"
              data-q={target?.tone}
              data-target={target ? '' : undefined}
              custom={exit}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
            >
              <div ref={inner} className="card__inner">
                <div className="card__top">{tags}</div>
                {editing === current.id ? (
                  <TrayEditor item={current} />
                ) : (
                  <p className="card__text" data-done={current.done || undefined}>
                    {current.text}
                  </p>
                )}
                <div className="card__foot">
                  <AnimatePresence mode="wait" initial={false}>
                    {target ? (
                      <motion.span
                        key={`t-${target.label}`}
                        className="card__target"
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, transition: { duration: 0.05 } }}
                        transition={{ duration: 0.12 }}
                      >
                        → {target.label}
                        <span className="card__confirm">
                          <Kbd k="enter" size="xs" /> confirm
                        </span>
                      </motion.span>
                    ) : (
                      <motion.span
                        key="idle"
                        className="card__idle"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0.05 } }}
                        transition={{ duration: 0.12 }}
                      >
                        {editing === current.id ? (
                          <>
                            <Kbd k="enter" size="xs" /> save <Kbd k="escape" size="xs" /> cancel
                          </>
                        ) : (
                          idle
                        )}
                      </motion.span>
                    )}
                  </AnimatePresence>
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
