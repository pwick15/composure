import { AnimatePresence } from 'motion/react'
import { useEffect, useMemo } from 'react'
import { Chip } from '../components/Chip'
import { Kbd, Keys } from '../components/Kbd'
import { QuadrantTag, SlotTag, TimeTag } from '../components/Tags'
import { Tray, type Receipt } from '../components/Tray'
import { todayKey } from '../lib/dates'
import { fmt, sumMinutes } from '../lib/duration'
import { keepFocus } from '../lib/motion'
import { QUADRANTS, QUADRANT_BY_ID, type QuadrantMeta } from '../lib/quadrants'
import { live, resolveSortCursor, sortGroups } from '../lib/selectors'
import { leaves } from '../lib/tree'
import type { Item } from '../lib/types'
import { deckFile, deckFocus, setMode } from '../state/actions'
import { useStore } from '../state/store'
import { ClarityLine } from './TodayMode'

interface QuadrantProps {
  meta: QuadrantMeta
  items: Item[]
  currentId: string | null
  landed: { id: string; n: number } | null
}

function QuadrantBox({ meta, items, currentId, landed }: QuadrantProps) {
  const flash = landed && items.some((i) => i.id === landed.id) ? landed.n : null
  const home = items.some((i) => i.id === currentId)
  return (
    <section
      className="quad"
      data-q={meta.id}
      data-home={home || undefined}
      onMouseDown={keepFocus}
      onClick={() => deckFile('sort', meta.id)}
      aria-label={`${meta.title}: ${meta.blurb}`}
    >
      {flash !== null && <span key={flash} className="quad__flash" />}
      <header className="quad__head">
        <span className="quad__keys">
          <Kbd k={meta.key} size="lg" className="quad__key" />
        </span>
        <div className="quad__titles">
          <h3>{meta.title}</h3>
          <span>{meta.blurb}</span>
        </div>
        {items.length > 0 && sumMinutes(items) > 0 && <span className="quad__time">{fmt(sumMinutes(items))}</span>}
        {items.length > 0 && <span className="quad__count">{items.length}</span>}
      </header>
      <div className="quad__body">
        <AnimatePresence initial={false} mode="popLayout">
          {items.map((it) => (
            <Chip
              key={it.id}
              item={it}
              selected={it.id === currentId}
              fresh={landed?.id === it.id}
              onSelect={() => deckFocus('sort', it.id)}
            />
          ))}
        </AnimatePresence>
        {!items.length && <p className="quad__empty">{meta.hint}</p>}
      </div>
    </section>
  )
}

export function SortMode() {
  const all = useStore((s) => s.items)
  const deck = useStore((s) => s.decks.sort)
  const landed = useStore((s) => s.landed)
  const today = todayKey()

  // Parents are labels for their subtasks, so only the subtasks are sorted.
  const items = useMemo(() => leaves(live(all)), [all])
  const currentId = resolveSortCursor(all, deck.cursor)
  const current = items.find((i) => i.id === currentId) ?? null
  const unsorted = useMemo(() => items.filter((i) => !i.quadrant), [items])
  const ahead = unsorted.filter((i) => i.id !== currentId).length

  const lastId = deck.trail.at(-1)
  const last = items.find((i) => i.id === lastId)
  const receipt: Receipt | null = last
    ? {
        item: last,
        label: last.quadrant ? QUADRANT_BY_ID[last.quadrant].title : 'Unsorted',
        tone: last.quadrant ?? 'none',
      }
    : null

  // Each quadrant lists its thoughts quickest first.
  const byQuadrant = useMemo(
    () => Object.fromEntries(sortGroups(all).slice(1).map((list, i) => [QUADRANTS[i].id, list])) as Record<string, Item[]>,
    [all],
  )

  useEffect(() => {
    document.querySelector('.quad .chip[data-selected]')?.scrollIntoView({ block: 'nearest' })
  }, [currentId])

  return (
    <div className="board">
      <Tray
        label="Unsorted"
        done={items.length - unsorted.length}
        total={items.length}
        current={current}
        ahead={ahead}
        receipt={receipt}
        tags={
          current && (
            <>
              <QuadrantTag item={current} />
              <SlotTag item={current} today={today} />
              <TimeTag item={current} nudge />
            </>
          )
        }
        idle={
          <>
            <Keys keys={['q', 'w', 'a', 's']} size="xs" /> to file
            <span className="card__sep">·</span>
            <Kbd label="1–6" size="xs" /> time
            <span className="card__sep">·</span>
            <Keys keys={['up', 'down']} size="xs" /> move
          </>
        }
        empty={
          items.length ? (
            <div className="tray-empty">
              <strong>Everything's sorted.</strong>
              <ClarityLine items={all} />
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
          <QuadrantBox key={q.id} meta={q} items={byQuadrant[q.id]} currentId={currentId} landed={landed} />
        ))}
        <div className="axis axis--y">Not important</div>
        {QUADRANTS.slice(2).map((q) => (
          <QuadrantBox key={q.id} meta={q} items={byQuadrant[q.id]} currentId={currentId} landed={landed} />
        ))}
      </div>
    </div>
  )
}
