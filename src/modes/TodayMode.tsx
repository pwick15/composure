import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, type ClipboardEvent, type KeyboardEvent } from 'react'
import { flushSync } from 'react-dom'
import { Kbd } from '../components/Kbd'
import { RowEditor } from '../components/RowEditor'
import { ParentRef, QuadrantTag, SlotTag, TimeTag } from '../components/Tags'
import { isOverdue, longDate, todayKey } from '../lib/dates'
import { feedback } from '../keyboard/feedback'
import { autosize } from '../lib/dom'
import { DEFAULT_FOCUS, fmt } from '../lib/duration'
import { EXIT_FAST, keepFocus, SPRING } from '../lib/motion'
import { QUADRANT_BY_ID } from '../lib/quadrants'
import {
  openInSession,
  resolveTodayCursor,
  timeLeft,
  todayList,
  todayProgress,
  todaySessions,
} from '../lib/selectors'
import { PAUSE_PRESETS } from '../lib/interrupt'
import { activeId, clock, effMinutes, leftovers, pauseLeftMs, remainingMs, taskClock, windowOf } from '../lib/session'
import { splitLines } from '../lib/text'
import type { Item } from '../lib/types'
import { useNow } from '../lib/useNow'
import {
  ADD_OPTIONS,
  pauseBegin,
  pauseClose,
  pauseEnd,
  pausePreset,
  pauseSubmit,
  sessionCarryOn,
  sessionStart,
  sessionStop,
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

/** Minutes → "52m" / "1h 5m", rounding up so a running clock never shows 0 early. */
const minutesLabel = (ms: number) => fmt(Math.max(1, Math.ceil(ms / 60_000)))

const clockTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** What's left today and when you'd be done: an invitation to start while idle, a live countdown in a session. */
function SessionSummary({ items, today }: { items: Item[]; today: string }) {
  const run = useStore((s) => s.run)
  const now = useNow(run?.phase === 'running' ? 1000 : 30_000)
  const left = timeLeft(items, today)
  if (!left.open) return null

  let ms = left.minutes * 60_000
  if (run?.phase === 'running') {
    const sessionOpen = new Set(openInSession(items, today, run.session).map((i) => i.id))
    const elsewhere = todayList(items, today).filter((i) => !run.queue.includes(i.id))
    ms = remainingMs(run, items, sessionOpen, taskClock(run, now)) + elsewhere.reduce((n, i) => n + effMinutes(i), 0) * 60_000
    // Away right now: the rest of the pause comes first.
    if (run.pause) ms += pauseLeftMs(run.pause, now)
  }
  const doneBy = clockTime(now + ms)
  const sessions = todaySessions(items, today).length
  // A task with no estimate is a guess, so say so rather than pretend to know.
  const guess = left.unestimated > 0
  const approx = guess ? '~' : ''

  return (
    <p
      className="time-left"
      title={guess ? `${left.unestimated} without a time, counted as ${fmt(DEFAULT_FOCUS)} each. - and = set one.` : undefined}
    >
      <span>
        <b>
          {approx}
          {minutesLabel(ms)}
        </b>{' '}
        left
      </span>
      <span>
        done by 
        <b>
          {approx}
          {doneBy}
        </b>
        {run?.phase === 'over' && ' if you carry on'}
      </span>
      {sessions > 1 && <span>across {sessions} sessions</span>}
      {!run && (
        <button className="linkish" onMouseDown={keepFocus} onClick={sessionStart}>
          start now
        </button>
      )}
    </p>
  )
}

/** The running session: the clock for the whole thing, the task it's on, and what to do next. */
function SessionPanel({ items, today }: { items: Item[]; today: string }) {
  const run = useStore((s) => s.run)
  const pausing = useStore((s) => s.pausing)
  const now = useNow(run?.phase === 'running' ? 1000 : null)
  if (!run) return null

  const name = `Session ${Math.max(1, todaySessions(items, today).findIndex((g) => g.session === run.session) + 1)}`
  const open = new Set(openInSession(items, today, run.session).map((i) => i.id))
  const byId = new Map(items.map((i) => [i.id, i]))

  if (run.phase === 'over') {
    const left = leftovers(run, open)
    return (
      <section className="session" data-phase="over" aria-live="polite">
        <div className="session__head">
          <span className="eyebrow">// {name.toLowerCase()} · time's up</span>
          <span className="session__clock">{clock(0)}</span>
        </div>
        <p className="session__lede">
          <b>{left.length}</b> not finished. Tick off what you did <Kbd k="mod+k" size="xs" />, give the rest the time they
          still need <Kbd k="-" size="xs" />
          <Kbd k="=" size="xs" />, then carry on <Kbd k="enter" size="xs" />.
        </p>
        <div className="session__actions">
          <button className="cta cta--inline" onMouseDown={keepFocus} onClick={sessionCarryOn}>
            Carry on <Kbd k="enter" size="xs" />
          </button>
          <button className="cta cta--inline" onMouseDown={keepFocus} onClick={sessionStop}>
            Stop <Kbd k="f" size="xs" />
          </button>
        </div>
      </section>
    )
  }

  const active = byId.get(activeId(run) ?? '')
  const win = windowOf(run, items)
  const upNext = run.queue
    .slice(run.index + 1)
    .map((id) => byId.get(id))
    .find((i): i is Item => Boolean(i) && open.has(i!.id))
  // While you're away the task's clock is held where it was.
  const t = taskClock(run, now)
  const winLeft = win ? win.start + win.ms - t : 0
  const { pause } = run

  if (pause) {
    const away = now - pause.startedAt
    const planned = pause.minutes === null ? null : pause.minutes * 60_000
    return (
      <section className="session" data-phase="running" data-paused aria-live="polite">
        <div className="session__head">
          <span className="eyebrow">// {name.toLowerCase()} · paused</span>
          <span className="session__clock">{clock(remainingMs(run, items, open, t))}</span>
        </div>
        <div className="session__now">
          <span className="tag tag--focus">{pause.over ? 'over' : 'away'}</span>
          <strong>{pause.label}</strong>
          <span className="session__window">
            {planned === null
              ? `${clock(away)} and counting`
              : planned > away
                ? `${clock(planned - away)} of ${fmt(pause.minutes!)}`
                : `+${clock(away - planned)} over`}
          </span>
        </div>
        <p className="session__lede">
          {active ? (
            <>
              Held: <b>{active.text}</b> · {clock(winLeft)} still yours
            </>
          ) : (
            'Your task is waiting.'
          )}
        </p>
        <p className="session__keys">
          <button className="cta cta--inline" onMouseDown={keepFocus} onClick={pauseEnd}>
            I'm back <Kbd k="enter" size="xs" />
          </button>
        </p>
      </section>
    )
  }

  return (
    <section className="session" data-phase="running" aria-live="off">
      <div className="session__head">
        <span className="eyebrow">// {name.toLowerCase()} · running</span>
        <span className="session__clock">{clock(remainingMs(run, items, open, t))}</span>
      </div>
      {active && (
        <>
          <div className="session__now">
            <span className="tag tag--focus">now</span>
            <strong>{active.text}</strong>
            <span className="session__window">
              {clock(winLeft)} of {fmt(effMinutes(active))}
            </span>
          </div>
          <div className="progress" aria-hidden>
            <div className="progress__fill" style={{ width: `${win ? Math.min(100, ((t - win.start) / win.ms) * 100) : 0}%` }} />
          </div>
        </>
      )}
      <p className="session__lede">
        {upNext ? (
          <>
            Next: <b>{upNext.text}</b> · {fmt(effMinutes(upNext))}
          </>
        ) : (
          'Last one.'
        )}
      </p>
      <p className="session__keys">
        <span>
          <Kbd k="mod+k" size="xs" /> done, next
        </span>
        <span>
          <Kbd k="=" size="xs" /> more time
        </span>
        <span>
          <Kbd k="i" size="xs" /> interruption
        </span>
        <span>
          <Kbd k="f" size="xs" /> stop
        </span>
      </p>
      {pausing && <PauseLine />}
    </section>
  )
}

/** "What came up?": 1–4 start a preset at once, or type it ("call mum 15m") and ↵. */
function PauseLine() {
  const ref = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => {
    ref.current?.focus({ preventScroll: true })
  }, [])
  return (
    <div className="pause-line" onMouseDown={keepFocus}>
      <div className="pause-line__input">
        <span className="prompt-glyph">›</span>
        <input
          ref={ref}
          placeholder="What came up? e.g. call mum 15m"
          aria-label="What came up"
          spellCheck={false}
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter') {
              e.preventDefault()
              feedback(e.nativeEvent, 'Away')
              flushSync(() => pauseSubmit(e.currentTarget.value))
            } else if (e.key === 'Escape') {
              e.preventDefault()
              feedback(e.nativeEvent, 'Cancel')
              pauseClose()
            } else if (!e.currentTarget.value && /^[1-4]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
              e.preventDefault()
              feedback(e.nativeEvent, PAUSE_PRESETS[Number(e.key) - 1].label)
              flushSync(() => pausePreset(Number(e.key)))
            }
          }}
          onBlur={pauseClose}
        />
      </div>
      <div className="pause-line__presets">
        {PAUSE_PRESETS.map((p, i) => (
          <button key={p.label} type="button" className="attr" onClick={() => pauseBegin(p.label, p.minutes)}>
            <span className="attr__n">{i + 1}</span>
            {p.label}
            {p.minutes ? ` ${fmt(p.minutes)}` : ''}
          </button>
        ))}
      </div>
    </div>
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
              title={`${QUADRANT_BY_ID[id].blurb}. ${QUADRANT_BY_ID[id].hint}`}
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
  const editing = useStore((s) => s.trayEditing)
  const pickedIds = useStore((s) => s.picked?.ids)
  const run = useStore((s) => s.run)
  const today = todayKey()

  const list = useMemo(() => todayList(items, today), [items, today])
  const currentId = resolveTodayCursor(items, cursor, today)
  const { done, total } = useMemo(() => todayProgress(items, today), [items, today])
  const allDone = total > 0 && list.length === 0
  const sessions = useMemo(() => todaySessions(items, today), [items, today])
  const active = run ? activeId(run) : null
  // Tasks whose window closed while still open, and (once time is up) everything left to finish.
  const inList = (id: string) => list.some((i) => i.id === id)
  const overtime = new Set(run && run.phase === 'running' ? run.queue.slice(0, run.index).filter(inList) : [])
  const leftSet = new Set(run?.phase === 'over' ? run.queue.filter(inList) : [])

  const nodes = sessions.flatMap((group, g) => {
    const running = run?.session === group.session
    const head = (
      <motion.li
        key={`session-${group.session}`}
        layout="position"
        className="session-head"
        data-running={(running && run?.phase === 'running') || undefined}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: EXIT_FAST }}
      >
        <span className="session-head__name">Session {g + 1}</span>
        <span className="session-head__meta">
          {group.items.length} open · {fmt(group.items.reduce((n, i) => n + effMinutes(i), 0))}
        </span>
        <span className="session-head__right">
          {running && run?.phase === 'running' && <span className="session-head__live">running</span>}
        </span>
      </motion.li>
    )
    const rows = group.items.map((item) => {
      const selected = item.id === currentId
      const isActive = active === item.id
      return (
        <motion.li
          key={item.id}
          layout="position"
          className="row today-row"
          data-selected={selected || undefined}
          data-picked={pickedIds?.includes(item.id) || undefined}
          data-focus={isActive || undefined}
          data-left={leftSet.has(item.id) || undefined}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, x: 24, transition: EXIT_FAST }}
          transition={SPRING}
          onClick={() => todayFocus(item.id)}
        >
          <span className="row__index today-check" aria-hidden>
            [ ]
          </span>
          <span className="row__main">
            {editing === item.id ? <RowEditor item={item} /> : <span className="row__text">{item.text}</span>}
            <ParentRef item={item} className="parent-ref--row" />
          </span>
          <span className="row__meta">
            {isActive && <span className="tag tag--focus">now</span>}
            {overtime.has(item.id) && <span className="tag tag--overdue">over time</span>}
            <TimeTag item={item} />
            {isOverdue(item.slot, today) && <SlotTag item={item} today={today} />}
            {item.quadrant && <QuadrantTag item={item} />}
          </span>
        </motion.li>
      )
    })
    return [head, ...rows]
  })

  useEffect(() => {
    document.querySelector('.today-row[data-selected]')?.scrollIntoView({ block: 'nearest' })
  }, [currentId])

  // While a session is running the current task fills the screen and everything else fades back.
  const focusing = run?.phase === 'running'

  return (
    <div className="dump" data-focusing={focusing || undefined}>
      <div className="dump__inner">
        <header className="dump__head">
          <div className="eyebrow">// today · {longDate(today)}</div>
          <h1>{allDone ? "Today's clear." : 'One thing at a time.'}</h1>
        </header>

        {total > 0 && (
          <div className="today-progress">
            <div className="progress" aria-hidden>
              <motion.div className="progress__fill" initial={false} animate={{ width: `${(done / total) * 100}%` }} />
            </div>
            <span className="tray__count">
              {done}/{total} done
            </span>
          </div>
        )}
        {list.length > 0 && <SessionSummary items={items} today={today} />}
        <SessionPanel items={items} today={today} />

        {list.length === 0 && !adding ? (
          <div className="dump-empty dump-empty--static">
            <span className="dump-empty__title">{allDone ? 'Everything for today is done.' : 'Nothing planned for today.'}</span>
            <span className="dump-empty__keys">
              <button className="cta cta--inline" onMouseDown={keepFocus} onClick={todayAddOpen}>
                Add a task <Kbd k="n" size="xs" />
              </button>
              <button className="cta cta--inline" onMouseDown={keepFocus} onClick={() => setMode('plan')}>
                Plan the week <Kbd k="shift+3" size="xs" />
              </button>
              {allDone && (
                <button className="cta cta--inline" onMouseDown={keepFocus} onClick={() => setMode('archive')}>
                  See what you did <Kbd k="shift+5" size="xs" />
                </button>
              )}
              <span>or enjoy the space.</span>
            </span>
          </div>
        ) : (
          <ol className="dump__list today-list">
            {adding && <Composer />}
            <AnimatePresence initial={false} mode="popLayout">
              {nodes}
            </AnimatePresence>
          </ol>
        )}

      </div>
    </div>
  )
}
