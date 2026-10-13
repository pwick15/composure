import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { flushSync } from 'react-dom'
import { Kbd } from '../components/Kbd'
import { ParentRef, QuadrantTag, SlotTag, TimeTag } from '../components/Tags'
import { isOverdue, longDate, todayKey } from '../lib/dates'
import { feedback } from '../keyboard/feedback'
import { autosize } from '../lib/dom'
import { DEFAULT_FOCUS, fmt } from '../lib/duration'
import { EXIT_FAST, keepFocus, SPRING } from '../lib/motion'
import { QUADRANT_BY_ID } from '../lib/quadrants'
import { clarity, resolveTodayCursor, timeSummary, todayList } from '../lib/selectors'
import { splitLines } from '../lib/text'
import {
  ADD_OPTIONS,
  setMode,
  todayAddArrow,
  todayAddBackToText,
  todayAddClose,
  todayAddEnter,
  todayAddMinutes,
  todayAddOpen,
  todayAddPaste,
  todayAddPick,
  todayAddQuadrant,
  todayFocus,
} from '../state/actions'
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

/** "3h 20m planned · 45m done · 2h 35m left · done by 6:10 pm": what today adds up to. */
function TimeSummary({ items, today }: { items: Parameters<typeof clarity>[0]; today: string }) {
  const t = timeSummary(items, today)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  if (!t.planned && !t.unestimated) return null
  const finish = new Date(now + t.left * 60_000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return (
    <p className="clarity clarity--time">
      {t.planned > 0 && (
        <span>
          <b>{fmt(t.planned)}</b> planned
        </span>
      )}
      {t.done > 0 && (
        <span>
          <b>{fmt(t.done)}</b> done
        </span>
      )}
      {t.left > 0 && (
        <>
          <span>
            <b>{fmt(t.left)}</b> left
          </span>
          <span>
            if you start now, done by <b>{finish}</b>
          </span>
        </>
      )}
      {t.unestimated > 0 && (
        <span className="clarity__muted">
          {t.unestimated} without a time <Kbd k="=" size="xs" />
        </span>
      )}
    </p>
  )
}

/** The "add a task" line: type it, ↓ to say what it is, ↵ to add. */
function Composer() {
  const add = useStore((s) => s.todayAdd)
  const ref = useRef<HTMLTextAreaElement>(null)
  const lastShift = useRef(0)
  const inOptions = add?.cursor != null

  useLayoutEffect(() => {
    ref.current?.focus({ preventScroll: true })
    ref.current?.closest('li')?.scrollIntoView({ block: 'nearest' })
  }, [])

  const run = (fn: () => void) => flushSync(fn)

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const native = e.nativeEvent
    if (native.isComposing) return
    const el = e.currentTarget
    const value = el.value
    const plain = !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey

    // Double-tap Shift finishes, like Esc. Any other key in between resets it.
    if (e.key === 'Shift') {
      if (e.repeat) return
      const now = performance.now()
      if (now - lastShift.current < 400) {
        lastShift.current = 0
        feedback(native, 'Finish')
        run(() => todayAddClose(value))
      } else lastShift.current = now
      return
    }
    lastShift.current = 0

    // ⇧↵ adds the task from anywhere, including while choosing options.
    if (e.key === 'Enter' && e.shiftKey && !e.altKey) {
      e.preventDefault()
      feedback(native, value.trim() ? 'Add' : 'Finish')
      run(() => todayAddEnter(value))
      el.value = ''
      autosize(el)
      return
    }

    if (inOptions) {
      const arrow = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key]
      if (arrow && plain) {
        e.preventDefault()
        feedback(native, arrow === 'up' ? 'Up' : arrow === 'down' ? 'Down' : arrow === 'left' ? '← Option' : 'Option →')
        todayAddArrow(arrow as 'up' | 'down' | 'left' | 'right')
        return
      }
      if (e.key === 'Enter' && plain) {
        e.preventDefault()
        feedback(native, 'Pick')
        return todayAddPick()
      }
      if (e.key === 'Backspace') {
        e.preventDefault()
        feedback(native, 'Back to text')
        return todayAddBackToText()
      }
      // Typing goes back to the text, and the character lands there.
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) todayAddBackToText()
    }

    if (e.key === 'Enter' && plain) {
      e.preventDefault()
      feedback(native, value.trim() ? 'Add' : 'Finish')
      run(() => todayAddEnter(value))
      // The line stays open for the next task: empty it (an empty Enter closed it instead).
      el.value = ''
      autosize(el)
    } else if (e.key === 'ArrowDown' && plain && el.selectionStart === el.selectionEnd && el.selectionEnd === value.length) {
      e.preventDefault()
      feedback(native, 'Options')
      todayAddArrow('down')
    } else if (e.key === 'Escape') {
      e.preventDefault()
      feedback(native, 'Finish')
      run(() => todayAddClose(value))
    } else if (e.key === 'Backspace' && value === '') {
      e.preventDefault()
      feedback(native, 'Close')
      run(() => todayAddClose(value))
    } else if (e.key === 'Tab') {
      e.preventDefault()
    }
  }

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const lines = splitLines(e.clipboardData.getData('text/plain'))
    if (lines.length < 2) return
    e.preventDefault()
    const el = e.currentTarget
    const merged = el.value.slice(0, el.selectionStart) + lines[0] + el.value.slice(el.selectionEnd)
    run(() => todayAddPaste(merged, lines.slice(1)))
    el.value = ''
    autosize(el)
  }

  const cursorAt = (row: number, col: number) => add?.cursor?.row === row && add.cursor.col === col
  return (
    <li className="row row--draft today-add" data-editing="" data-options={inOptions || undefined}>
      <span className="row__index row__index--prompt">›</span>
      <textarea
        ref={ref}
        className="row__input"
        rows={1}
        placeholder="Add a task for today…"
        aria-label="New task for today"
        spellCheck
        onInput={(e) => autosize(e.currentTarget)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={(e) => todayAddClose(e.currentTarget.value)}
      />
      <span className="row__meta row__meta--hint">
        {inOptions ? (
          <>
            <Kbd k="enter" size="xs" /> pick <Kbd k="shift+enter" size="xs" /> add
          </>
        ) : (
          <>
            <Kbd k="enter" size="xs" /> add <Kbd k="down" size="xs" /> options
          </>
        )}
      </span>
      <div className="today-add__attrs" onMouseDown={keepFocus}>
        <div className="today-add__row" data-active={add?.cursor?.row === 0 || undefined}>
          <span className="today-add__label">quadrant</span>
          {ADD_OPTIONS.quadrant.map((id, i) => (
            <button
              key={id}
              type="button"
              className="attr"
              data-q={id}
              data-on={add?.quadrant === id || undefined}
              data-cursor={cursorAt(0, i) || undefined}
              title={QUADRANT_BY_ID[id].blurb}
              onClick={() => todayAddQuadrant(id)}
            >
              {QUADRANT_BY_ID[id].title}
            </button>
          ))}
        </div>
        <div className="today-add__row" data-active={add?.cursor?.row === 1 || undefined}>
          <span className="today-add__label">time</span>
          {ADD_OPTIONS.minutes.map((m, i) => (
            <button
              key={m}
              type="button"
              className="attr"
              data-on={add?.minutes === m || undefined}
              data-cursor={cursorAt(1, i) || undefined}
              onClick={() => todayAddMinutes(m)}
            >
              {fmt(m)}
            </button>
          ))}
        </div>
      </div>
    </li>
  )
}

export function TodayMode() {
  const items = useStore((s) => s.items)
  const adding = useStore((s) => s.todayAdd !== null)
  const cursor = useStore((s) => s.todayCursor)
  const focus = useStore((s) => s.focus)
  const today = todayKey()

  const list = useMemo(() => todayList(items, today), [items, today])
  const currentId = resolveTodayCursor(items, cursor, today)
  const done = list.filter((i) => i.done).length
  const allDone = list.length > 0 && done === list.length
  const current = list.find((i) => i.id === currentId)

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
        {list.length > 0 && <TimeSummary items={items} today={today} />}

        {list.length === 0 && !adding ? (
          <div className="dump-empty dump-empty--static">
            <span className="dump-empty__title">Nothing planned for today.</span>
            <span className="dump-empty__keys">
              <button className="cta cta--inline" onMouseDown={keepFocus} onClick={todayAddOpen}>
                Add a task <Kbd k="n" size="xs" />
              </button>
              <button className="cta cta--inline" onMouseDown={keepFocus} onClick={() => setMode('plan')}>
                Plan the week <Kbd k="shift+3" size="xs" />
              </button>
              <span>or enjoy the space.</span>
            </span>
          </div>
        ) : (
          <ol className="dump__list today-list">
            {adding && <Composer />}
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
                    <span className="row__main">
                      <span className="row__text">{item.text}</span>
                      <ParentRef item={item} className="parent-ref--row" />
                    </span>
                    <span className="row__meta">
                      {focused && <span className="tag tag--focus">focus</span>}
                      <TimeTag item={item} />
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
              <Kbd k="n" size="xs" /> add
            </span>
            <span>
              <Kbd k="x" size="xs" /> done
            </span>
            <span>
              <Kbd k="t" size="xs" /> not today
            </span>
            <span>
              <Kbd k="f" size="xs" /> focus {fmt(current?.minutes ?? DEFAULT_FOCUS)}
            </span>
            <span>
              <Kbd k="-" size="xs" />
              <Kbd k="=" size="xs" /> change time
            </span>
          </p>
        )}
      </div>
    </div>
  )
}
