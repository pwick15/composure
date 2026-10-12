import { AnimatePresence } from 'motion/react'
import { useMemo } from 'react'
import { Chip } from '../components/Chip'
import { Kbd } from '../components/Kbd'
import { DoneTag, QuadrantTag, SlotTag } from '../components/Tags'
import { Tray } from '../components/Tray'
import { columnFor, isDateSlot, LATER, planColumns, slotLabel, todayKey, type DayColumn } from '../lib/dates'
import { keepFocus } from '../lib/motion'
import { isPlannable, itemsInColumn, planQueue, resolvePlanCursor } from '../lib/selectors'
import type { Item } from '../lib/types'
import { planAssign, planFocus, setMode } from '../state/actions'
import { copyPlan, downloadCalendar, sendToThings } from '../state/exporters'
import { useStore } from '../state/store'

interface DayProps {
  col: DayColumn
  num: number
  items: Item[]
  current: Item | null
  pending: boolean
  landed: { id: string; n: number } | null
  today: string
}

function DayBox({ col, num, items, current, pending, landed, today }: DayProps) {
  const flash = landed && items.some((i) => i.id === landed.id) ? landed.n : null
  return (
    <section
      className="day"
      data-today={col.today || undefined}
      data-weekend={col.weekend || undefined}
      data-later={col.key === LATER || undefined}
      data-pending={pending || undefined}
      onMouseDown={keepFocus}
      onClick={() => planAssign(col.key)}
      aria-label={col.sub}
    >
      {flash !== null && <span key={flash} className="quad__flash" data-q="accent" />}
      <header className="day__head">
        <Kbd k={String(num)} size="md" className="day__key" />
        <div className="day__titles">
          <h3>{col.label}</h3>
          <span>{col.key === LATER ? col.sub : col.sub.split(' ').slice(1).join(' ')}</span>
        </div>
        {items.length > 0 && <span className="day__count">{items.length}</span>}
      </header>
      <div className="day__body">
        <AnimatePresence initial={false} mode="popLayout">
          {pending && current && <Chip key={`ghost-${current.id}`} item={current} ghost />}
          {items.map((it) => (
            <Chip
              key={it.id}
              item={it}
              fresh={landed?.id === it.id}
              meta={col.key === LATER && isDateSlot(it.slot) ? slotLabel(it.slot, today) : undefined}
              onSelect={() => planFocus(it.id)}
            />
          ))}
        </AnimatePresence>
      </div>
    </section>
  )
}

export function PlanMode() {
  const items = useStore((s) => s.items)
  const cursor = useStore((s) => s.planCursor)
  const pending = useStore((s) => s.planPending)
  const landed = useStore((s) => s.landed)
  const today = todayKey()
  const cols = useMemo(() => planColumns(today), [today])

  const currentId = resolvePlanCursor(items, cursor, today)
  const current = items.find((i) => i.id === currentId) ?? null
  const queue = useMemo(() => planQueue(items, today), [items, today])
  const plannable = useMemo(() => items.filter((i) => isPlannable(i) && !(i.done && !columnFor(i.slot, today))), [items, today])
  const dropped = items.length - items.filter(isPlannable).length

  const pendingCol = pending ? (pending.value === null ? null : columnFor(pending.value, today)) : undefined
  const target = pending
    ? pending.value === null
      ? { label: 'Unplanned', tone: 'none' }
      : { label: cols.find((c) => c.key === pendingCol)?.sub ?? 'Later', tone: 'accent' }
    : null

  return (
    <div className="board">
      <Tray
        label="Unplanned"
        done={plannable.length - queue.length}
        total={plannable.length}
        current={current}
        ahead={queue.filter((i) => i.id !== currentId).length}
        target={target}
        tags={
          current && (
            <>
              <QuadrantTag item={current} />
              <SlotTag item={current} today={today} />
              <DoneTag item={current} />
            </>
          )
        }
        idle={
          <>
            <Kbd label="1–7" size="xs" /> day · <Kbd k="8" size="xs" /> later · <Kbd k="left" size="xs" />
            <Kbd k="right" size="xs" /> pick
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
            items={itemsInColumn(items, col.key, today).filter((it) => it.id !== currentId)}
            current={current}
            pending={pendingCol === col.key}
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
