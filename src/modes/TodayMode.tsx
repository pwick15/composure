import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo } from 'react'
import { Kbd } from '../components/Kbd'
import { QuadrantTag, SlotTag } from '../components/Tags'
import { isOverdue, longDate, todayKey } from '../lib/dates'
import { EXIT_FAST, keepFocus, SPRING } from '../lib/motion'
import { clarity, resolveTodayCursor, todayList } from '../lib/selectors'
import { setMode, todayFocus } from '../state/actions'
import { useStore } from '../state/store'

/** "14 out of your head · 4 let go · 3 for today": how much lighter things got. */
export function ClarityLine({ items }: { items: Parameters<typeof clarity>[0] }) {
  const c = clarity(items, todayKey())
  if (!c.total) return null
  return (
    <p className="clarity">
      <span>
        <b>{c.total}</b> out of your head
      </span>
      {c.dropped > 0 && (
        <span>
          <b>{c.dropped}</b> let go
        </span>
      )}
      <span>
        <b>{c.today}</b> for today
      </span>
    </p>
  )
}

export function TodayMode() {
  const items = useStore((s) => s.items)
  const cursor = useStore((s) => s.todayCursor)
  const focus = useStore((s) => s.focus)
  const today = todayKey()

  const list = useMemo(() => todayList(items, today), [items, today])
  const currentId = resolveTodayCursor(items, cursor, today)
  const done = list.filter((i) => i.done).length
  const allDone = list.length > 0 && done === list.length

  useEffect(() => {
    document.querySelector('.today-row[data-selected]')?.scrollIntoView({ block: 'nearest' })
  }, [currentId])

  return (
    <div className="dump">
      <div className="dump__inner">
        <header className="dump__head">
          <div className="eyebrow">// today · {longDate(today)}</div>
          <h1>{allDone ? "Today's clear." : 'One thing at a time.'}</h1>
          <ClarityLine items={items} />
        </header>

        {list.length > 0 && (
          <div className="today-progress">
            <div className="progress" aria-hidden>
              <motion.div className="progress__fill" initial={false} animate={{ width: `${(done / list.length) * 100}%` }} />
            </div>
            <span className="tray__count">
              {done}/{list.length} done
            </span>
          </div>
        )}

        {list.length === 0 ? (
          <div className="dump-empty dump-empty--static">
            <span className="dump-empty__title">Nothing planned for today.</span>
            <span className="dump-empty__keys">
              <button className="cta cta--inline" onMouseDown={keepFocus} onClick={() => setMode('plan')}>
                Plan the week <Kbd k="shift+3" size="xs" />
              </button>
              <span>or enjoy the space.</span>
            </span>
          </div>
        ) : (
          <ol className="dump__list today-list">
            <AnimatePresence initial={false} mode="popLayout">
              {list.map((item) => {
                const selected = item.id === currentId
                const focused = focus?.id === item.id
                return (
                  <motion.li
                    key={item.id}
                    layout="position"
                    className="row today-row"
                    data-selected={selected || undefined}
                    data-done={item.done || undefined}
                    data-focus={focused || undefined}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 24, transition: EXIT_FAST }}
                    transition={SPRING}
                    onClick={() => todayFocus(item.id)}
                  >
                    <span className="row__index today-check" aria-hidden>
                      <AnimatePresence initial={false} mode="wait">
                        <motion.span
                          key={item.done ? 'x' : 'o'}
                          initial={{ scale: 0.4, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.4, opacity: 0, transition: { duration: 0.06 } }}
                        >
                          {item.done ? '[x]' : '[ ]'}
                        </motion.span>
                      </AnimatePresence>
                    </span>
                    <span className="row__text">{item.text}</span>
                    <span className="row__meta">
                      {focused && <span className="tag tag--focus">focus</span>}
                      {isOverdue(item.slot, today) && <SlotTag item={item} today={today} />}
                      {item.quadrant && <QuadrantTag item={item} />}
                    </span>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ol>
        )}

        {list.length > 0 && (
          <p className="today-keys">
            <span>
              <Kbd k="x" size="xs" /> done
            </span>
            <span>
              <Kbd k="t" size="xs" /> not today
            </span>
            <span>
              <Kbd k="f" size="xs" /> focus 25 min
            </span>
            <span>
              <Kbd k="shift+up" size="xs" />
              <Kbd k="shift+down" size="xs" /> reorder
            </span>
          </p>
        )}
      </div>
    </div>
  )
}
