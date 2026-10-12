import { AnimatePresence } from 'motion/react'
import { useMemo } from 'react'
import { Chip } from '../components/Chip'
import { Kbd, Keys } from '../components/Kbd'
import { DoneTag, QuadrantTag, SlotTag } from '../components/Tags'
import { Tray } from '../components/Tray'
import { todayKey } from '../lib/dates'
import { keepFocus } from '../lib/motion'
import { QUADRANTS, QUADRANT_BY_ID, type QuadrantMeta } from '../lib/quadrants'
import { resolveSortCursor } from '../lib/selectors'
import type { Item } from '../lib/types'
import { setMode, sortAssign, sortFocus } from '../state/actions'
import { useStore } from '../state/store'

interface QuadrantProps {
  meta: QuadrantMeta
  items: Item[]
  current: Item | null
  pending: boolean
  landed: { id: string; n: number } | null
}

function QuadrantBox({ meta, items, current, pending, landed }: QuadrantProps) {
  const flash = landed && items.some((i) => i.id === landed.id) ? landed.n : null
  return (
    <section
      className="quad"
      data-q={meta.id}
      data-pending={pending || undefined}
      onMouseDown={keepFocus}
      onClick={() => sortAssign(meta.id)}
      aria-label={`${meta.title}: ${meta.blurb}`}
    >
      {flash !== null && <span key={flash} className="quad__flash" />}
      <header className="quad__head">
        <span className="quad__keys">
          <Kbd k={meta.key} also={[`shift+${meta.key}`]} size="lg" className="quad__key" />
          <Kbd k={meta.num} size="xs" className="quad__num" />
        </span>
        <div className="quad__titles">
          <h3>{meta.title}</h3>
          <span>{meta.blurb}</span>
        </div>
        {items.length > 0 && <span className="quad__count">{items.length}</span>}
      </header>
      <div className="quad__body">
        <AnimatePresence initial={false} mode="popLayout">
          {pending && current && <Chip key={`ghost-${current.id}`} item={{ ...current, quadrant: meta.id }} ghost />}
          {items.map((it) => (
            <Chip key={it.id} item={it} fresh={landed?.id === it.id} onSelect={() => sortFocus(it.id)} />
          ))}
        </AnimatePresence>
        {!items.length && !pending && <p className="quad__empty">{meta.hint}</p>}
      </div>
    </section>
  )
}

export function SortMode() {
  const items = useStore((s) => s.items)
  const cursor = useStore((s) => s.sortCursor)
  const pending = useStore((s) => s.sortPending)
  const landed = useStore((s) => s.landed)
  const today = todayKey()

  const currentId = resolveSortCursor(items, cursor)
  const current = items.find((i) => i.id === currentId) ?? null
  const unsorted = useMemo(() => items.filter((i) => !i.quadrant), [items])
  const ahead = unsorted.filter((i) => i.id !== currentId).length

  const target = pending
    ? pending.value
      ? { label: QUADRANT_BY_ID[pending.value].title, tone: pending.value }
      : { label: 'Unsorted', tone: 'none' }
    : null

  const byQuadrant = useMemo(
    () =>
      Object.fromEntries(
        QUADRANTS.map((q) => [q.id, items.filter((i) => i.quadrant === q.id && i.id !== currentId)]),
      ) as Record<string, Item[]>,
    [items, currentId],
  )

  return (
    <div className="board">
      <Tray
        label="Unsorted"
        done={items.length - unsorted.length}
        total={items.length}
        current={current}
        ahead={ahead}
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
            <Keys keys={['q', 'w', 'a', 's']} size="xs" /> or <Keys keys={['1', '2', '3', '4']} size="xs" /> to choose
          </>
        }
        empty={
          items.length ? (
            <div className="tray-empty">
              <strong>Everything's sorted.</strong>
              <span>
                Now give the important ones a day.{' '}
                <button className="cta cta--inline" onMouseDown={keepFocus} onClick={() => setMode('plan')}>
                  Plan <Kbd k="shift+3" size="xs" />
                </button>
              </span>
            </div>
          ) : (
            <div className="tray-empty">
              <strong>Nothing to sort yet.</strong>
              <span>
                Dump what's on your mind first.{' '}
                <button className="cta cta--inline" onMouseDown={keepFocus} onClick={() => setMode('dump')}>
                  Dump <Kbd k="shift+1" size="xs" />
                </button>
              </span>
            </div>
          )
        }
      />

      <div className="matrix">
        <div className="axis axis--corner" />
        <div className="axis axis--x">Urgent</div>
        <div className="axis axis--x">Not urgent</div>
        <div className="axis axis--y">Important</div>
        {QUADRANTS.slice(0, 2).map((q) => (
          <QuadrantBox
            key={q.id}
            meta={q}
            items={byQuadrant[q.id]}
            current={current}
            pending={pending?.value === q.id}
            landed={landed}
          />
        ))}
        <div className="axis axis--y">Not important</div>
        {QUADRANTS.slice(2).map((q) => (
          <QuadrantBox
            key={q.id}
            meta={q}
            items={byQuadrant[q.id]}
            current={current}
            pending={pending?.value === q.id}
            landed={landed}
          />
        ))}
      </div>
    </div>
  )
}
