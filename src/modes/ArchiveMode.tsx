import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo } from 'react'
import { Kbd } from '../components/Kbd'
import { ParentRef, QuadrantTag, TimeTag } from '../components/Tags'
import { addDays, longDate, todayKey } from '../lib/dates'
import { fmt, sumMinutes } from '../lib/duration'
import { EXIT_FAST, SPRING } from '../lib/motion'
import { archiveDays, resolveArchiveCursor } from '../lib/selectors'
import { archiveFocus } from '../state/actions'
import { useStore } from '../state/store'

/** "Yesterday", "Tue 13 Oct", or "Earlier" for things nobody dated. */
const dayLabel = (day: string | null, today: string) =>
  day === null ? 'Earlier' : day === addDays(today, -1) ? 'Yesterday' : longDate(day)

const timeOf = (ms: number | null) =>
  ms === null ? '' : new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export function ArchiveMode() {
  const items = useStore((s) => s.items)
  const cursor = useStore((s) => s.archiveCursor)
  const today = todayKey()

  const days = useMemo(() => archiveDays(items, today), [items, today])
  const total = days.reduce((n, d) => n + d.items.length, 0)
  const currentId = resolveArchiveCursor(items, cursor, today)

  useEffect(() => {
    document.querySelector('.archive-row[data-selected]')?.scrollIntoView({ block: 'nearest' })
  }, [currentId])

  const nodes = days.flatMap((group) => {
    const minutes = sumMinutes(group.items)
    const head = (
      <motion.li
        key={`day-${group.day}`}
        layout="position"
        className="session-head"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: EXIT_FAST }}
      >
        <span className="session-head__name">{dayLabel(group.day, today)}</span>
        <span className="session-head__meta">
          {group.items.length} done{minutes ? ` · ${fmt(minutes)}` : ''}
        </span>
      </motion.li>
    )
    const rows = group.items.map((item) => (
      <motion.li
        key={item.id}
        layout="position"
        className="row today-row archive-row"
        data-selected={item.id === currentId || undefined}
        data-done
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: 24, transition: EXIT_FAST }}
        transition={SPRING}
        onClick={() => archiveFocus(item.id)}
      >
        <span className="row__index today-check" aria-hidden>
          [x]
        </span>
        <span className="row__main">
          <span className="row__text">{item.text}</span>
          <ParentRef item={item} className="parent-ref--row" />
        </span>
        <span className="row__meta">
          <TimeTag item={item} />
          {item.quadrant && <QuadrantTag item={item} />}
          {item.doneAt !== null && <span className="tag tag--muted">{timeOf(item.doneAt)}</span>}
        </span>
      </motion.li>
    ))
    return [head, ...rows]
  })

  return (
    <div className="dump">
      <div className="dump__inner">
        <header className="dump__head">
          <div className="eyebrow">// archive</div>
          <h1>{total ? 'What you got done.' : 'Nothing archived yet.'}</h1>
          <p className="lede">
            {total
              ? 'Finished thoughts rest here from the day after you tick them off.'
              : 'Tick something off. Tomorrow it moves here, out of the way.'}
          </p>
        </header>

        {total > 0 && (
          <>
            <ol className="dump__list today-list">
              <AnimatePresence initial={false} mode="popLayout">
                {nodes}
              </AnimatePresence>
            </ol>
            <p className="today-keys">
              <span>
                <Kbd k="x" size="xs" /> reopen
              </span>
              <span>
                <Kbd k="mod+backspace" size="xs" /> delete
              </span>
              <span>
                <Kbd k="up" size="xs" />
                <Kbd k="down" size="xs" /> move
              </span>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
