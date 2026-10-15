import { AnimatePresence } from 'motion/react'
import { useEffect, useMemo } from 'react'
import { Chip } from '../components/Chip'
import { Kbd, Keys } from '../components/Kbd'
import { DoneTag, QuadrantTag, SlotTag, TimeTag } from '../components/Tags'
import { Tray, type Receipt } from '../components/Tray'
import { columnFor, isDateSlot, LATER, planColumns, slotLabel, todayKey, type DayColumn } from '../lib/dates'
import { fmt, sumMinutes } from '../lib/duration'
import { keepFocus } from '../lib/motion'
import { isPlannable, itemsInColumn, live, planQueue, resolvePlanCursor } from '../lib/selectors'
import { leaves } from '../lib/tree'
import type { Item } from '../lib/types'
import { deckFile, deckFocus, setMode } from '../state/actions'
import { copyPlan, downloadCalendar, sendToThings } from '../state/exporters'
import { useStore } from '../state/store'

interface DayProps {
  col: DayColumn
  num: number
  items: Item[]
  currentId: string | null
  landed: { id: string; n: number } | null
  today: string
}

function DayBox({ col, num, items, currentId, landed, today }: DayProps) {
  const flash = landed && items.some((i) => i.id === landed.id) ? landed.n : null
  const home = items.some((i) => i.id === currentId)
  return (
    <section
      className="day"
      data-today={col.today || undefined}
      data-weekend={col.weekend || undefined}
      data-later={col.key === LATER || undefined}
      data-home={home || undefined}
      onMouseDown={keepFocus}
      onClick={() => deckFile('plan', col.key)}
      aria-label={col.sub}
    >
      {flash !== null && <span key={flash} className="quad__flash" data-q="accent" />}
      <header className="day__head">
        <Kbd k={String(num)} size="md" className="day__key" />
        <div className="day__titles">
          <h3>{col.label}</h3>
          <span>
            {col.key === LATER ? col.sub : col.sub.split(' ').slice(1).join(' ')}
            {sumMinutes(items) > 0 && ` · ${fmt(sumMinutes(items))}`}
          </span>
        </div>
        {items.length > 0 && <span className="day__count">{items.length}</span>}
      </header>
      <div className="day__body">
        <AnimatePresence initial={false} mode="popLayout">
          {items.map((it) => (
            <Chip
              key={it.id}
              item={it}
              selected={it.id === currentId}
              fresh={landed?.id === it.id}
              meta={col.key === LATER && isDateSlot(it.slot) ? slotLabel(it.slot, today) : undefined}
              onSelect={() => deckFocus('plan', it.id)}
            />
          ))}
        </AnimatePresence>
      </div>
    </section>
  )
}

export function PlanMode() {
  const all = useStore((s) => s.items)
  const deck = useStore((s) => s.decks.plan)
  const landed = useStore((s) => s.landed)
  const today = todayKey()
  const cols = useMemo(() => planColumns(today), [today])

  // Parents are labels for their subtasks, so only the subtasks are planned.
  const items = useMemo(() => leaves(live(all, today)), [all, today])
  const currentId = resolvePlanCursor(all, deck.cursor, today)
  const current = items.find((i) => i.id === currentId) ?? null
  const queue = useMemo(() => planQueue(all, today), [all, today])
  const plannable = useMemo(
    () => items.filter((i) => isPlannable(i) && !(i.done && !columnFor(i.slot, today))),
    [items, today],
  )
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
              <QuadrantTag item={current} />
              <SlotTag item={current} today={today} />
              <TimeTag item={current} />
              <DoneTag item={current} />
            </>
          )
        }
        idle={
          <>
            <Kbd label="1–7" size="xs" /> day · <Kbd k="8" size="xs" /> later
            <span className="card__sep">·</span>
            <Keys keys={['up', 'down']} size="xs" /> move
            <span className="card__sep">·</span>
            <Keys keys={['left', 'right']} size="xs" /> days
            <span className="card__sep">·</span>
            <Keys keys={['-', '=']} size="xs" /> time
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

      <div className="week">
        {cols.map((col, i) => (
          <DayBox
            key={col.key}
            col={col}
            num={i + 1}
            items={itemsInColumn(all, col.key, today)}
            currentId={currentId}
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
