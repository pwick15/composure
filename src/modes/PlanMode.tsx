import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, type CSSProperties } from 'react'
import { Chip } from '../components/Chip'
import { Kbd } from '../components/Kbd'
import { QuadrantTag, SlotTag, TimeTag } from '../components/Tags'
import { Tray, type Receipt } from '../components/Tray'
import { isDateSlot, isOverdue, LATER, planColumns, shortDay, slotLabel, type DayColumn } from '../lib/dates'
import { fmt, sumMinutes } from '../lib/duration'
import { keepFocus } from '../lib/motion'
import { isPlannable, itemsInColumn, live, planQueue, resolvePlanCursor } from '../lib/selectors'
import { leaves } from '../lib/tree'
import type { Item } from '../lib/types'
import { deckFile, deckFocus, sessionName, setMode } from '../state/actions'
import { copyPlan, downloadCalendar, sendToThings } from '../state/exporters'
import { useStore } from '../state/store'

interface DayProps {
  col: DayColumn
  num: number
  items: Item[]
  /** On Today's column: overdue thoughts, which Today lists but Plan keeps in its queue to re-plan. */
  late?: number
  currentId: string | null
  picked: Set<string>
  landed: { id: string; n: number } | null
  today: string
}

function DayBox({ col, num, items, late = 0, currentId, picked, landed, today }: DayProps) {
  const flash = landed && items.some((i) => i.id === landed.id) ? landed.n : null
  const home = items.some((i) => i.id === currentId)
  return (
    <section
      className="day"
      data-today={col.today || undefined}
      data-weekend={col.weekend || undefined}
      data-later={col.key === LATER || undefined}
      data-home={home || undefined}
      aria-label={col.sub}
    >
      {flash !== null && <span key={flash} className="quad__flash" data-q="accent" />}
      {/* Only the heading files the card: a stray click in the list should never move a thought. */}
      <header className="day__head" title="Plan it for this day" onMouseDown={keepFocus} onClick={() => deckFile('plan', col.key)}>
        <Kbd k={String(num)} size="md" className="day__key" />
        <div className="day__titles">
          <h3>{col.label}</h3>
          <span>{col.key === LATER ? col.sub : col.sub.split(' ').slice(1).join(' ')}</span>
        </div>
        {/* The day's load: its time when there are estimates, else how many. */}
        {items.length > 0 && (
          <span className="day__count" title={`${items.length} ${items.length === 1 ? 'thought' : 'thoughts'}`}>
            {sumMinutes(items) > 0 ? fmt(sumMinutes(items)) : items.length}
          </span>
        )}
      </header>
      <div className="day__body">
        {late > 0 && (
          <p className="day__late" title="Today lists them too. Give each a day from the card above">
            {late} late, waiting above
          </p>
        )}
        <AnimatePresence initial={false} mode="popLayout">
          {items.flatMap((it, i) => {
            // A day split into work sessions shows them, named, the way Today does.
            const split = col.key !== LATER && items.some((o) => o.session !== it.session)
            const head =
              split && it.session !== items[i - 1]?.session ? (
                <motion.div key={`s${it.session}`} layout="position" className="day__session">
                  {sessionName(it.session, col.key)}
                </motion.div>
              ) : null
            const chip = (
              <Chip
                key={it.id}
                item={it}
                selected={it.id === currentId}
                picked={picked.has(it.id)}
                fresh={landed?.id === it.id}
                meta={col.key === LATER && isDateSlot(it.slot) ? shortDay(it.slot, today) : undefined}
                onSelect={() => deckFocus('plan', it.id)}
              />
            )
            return head ? [head, chip] : [chip]
          })}
        </AnimatePresence>
      </div>
    </section>
  )
}

export function PlanMode() {
  const all = useStore((s) => s.items)
  const deck = useStore((s) => s.decks.plan)
  const landed = useStore((s) => s.landed)
  const pickedIds = useStore((s) => s.picked?.ids)
  const picked = useMemo(() => new Set(pickedIds), [pickedIds])
  const today = useStore((s) => s.today)
  useStore((s) => s.sessionNames) // session names show in the day columns
  const cols = useMemo(() => planColumns(today), [today])
  const columns = useMemo(() => cols.map((col) => itemsInColumn(all, col.key, today)), [all, cols, today])

  // Parents are labels for their subtasks, so only the subtasks are planned.
  const items = useMemo(() => leaves(live(all)), [all])
  const currentId = resolvePlanCursor(all, deck.cursor, today)
  const current = items.find((i) => i.id === currentId) ?? null
  const queue = useMemo(() => planQueue(all, today), [all, today])
  const plannable = useMemo(() => items.filter(isPlannable), [items])
  const dropped = items.length - items.filter(isPlannable).length

  const lastId = deck.trail.at(-1)
  const last = items.find((i) => i.id === lastId)
  const receipt: Receipt | null = last
    ? {
        item: last,
        label: last.slot ? slotLabel(last.slot, today) : 'Unplanned',
        tone: last.slot ? 'accent' : 'none',
      }
    : null

  useEffect(() => {
    document.querySelector('.day .chip[data-selected]')?.scrollIntoView({ block: 'nearest' })
  }, [currentId])

  return (
    <div className="board">
      <Tray
        label="Unplanned"
        done={plannable.length - queue.length}
        total={plannable.length}
        current={current}
        ahead={queue.filter((i) => i.id !== currentId).length}
        receipt={receipt}
        tags={
          current && (
            <>
              {picked.size > 1 && <span className="tag tag--focus">{picked.size} picked</span>}
              <QuadrantTag item={current} edit />
              <SlotTag item={current} today={today} edit />
              <TimeTag item={current} nudge edit />
            </>
          )
        }
        idle={
          <>
            <Kbd label="1–7" size="xs" /> day · <Kbd k="8" size="xs" /> later
            <span className="card__sep">·</span>
            <Kbd k="space" size="xs" /> skip
            <span className="card__sep">·</span>
            <Kbd k="enter" size="xs" /> open
          </>
        }
        empty={
          plannable.length ? (
            <div className="tray-empty">
              <strong>Your week is planned.</strong>
              <span className="tray-empty__actions">
                Take it with you:
                <button className="cta cta--inline" onMouseDown={keepFocus} onClick={() => void copyPlan()}>
                  Copy as Markdown
                </button>
                <button className="cta cta--inline" onMouseDown={keepFocus} onClick={downloadCalendar}>
                  Calendar (.ics)
                </button>
                <button className="cta cta--inline" onMouseDown={keepFocus} onClick={sendToThings}>
                  Things 3
                </button>
              </span>
            </div>
          ) : (
            <div className="tray-empty">
              <strong>Nothing to plan yet.</strong>
              <span>
                {items.length ? 'Sort your thoughts first.' : 'Dump what is on your mind first.'}{' '}
                <button
                  className="cta cta--inline"
                  onMouseDown={keepFocus}
                  onClick={() => setMode(items.length ? 'sort' : 'dump')}
                >
                  {items.length ? 'Sort' : 'Dump'} <Kbd k={items.length ? 'shift+2' : 'shift+1'} size="xs" />
                </button>
              </span>
            </div>
          )
        }
      />

      {/* Empty days give their width to the days that have something in them. */}
      <div className="week" style={{ '--cols': columns.map((list) => `minmax(0, ${list.length ? 1 : 0.6}fr)`).join(' ') } as CSSProperties}>
        {cols.map((col, i) => (
          <DayBox
            key={col.key}
            col={col}
            num={i + 1}
            items={columns[i]}
            late={col.today ? queue.filter((it) => isOverdue(it.slot, today)).length : 0}
            currentId={currentId}
            picked={picked}
            landed={landed}
            today={today}
          />
        ))}
      </div>

      {dropped > 0 && (
        <p className="board__note">
          {dropped} dropped {dropped === 1 ? 'thought is' : 'thoughts are'} hidden here. Letting go counts as a decision.
        </p>
      )}
    </div>
  )
}
