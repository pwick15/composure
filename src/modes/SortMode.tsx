import { AnimatePresence } from 'motion/react'
import { useEffect, useMemo } from 'react'
import { Chip } from '../components/Chip'
import { Kbd } from '../components/Kbd'
import { QuadrantTag, SlotTag, TimeTag } from '../components/Tags'
import { Tray, type Receipt } from '../components/Tray'
import { shortDay } from '../lib/dates'
import { fmt, sumMinutes } from '../lib/duration'
import { keepFocus } from '../lib/motion'
import { QUADRANTS, QUADRANT_BY_ID, type QuadrantMeta } from '../lib/quadrants'
import { doneDay, live, quickLane, resolveSortCursor, sortGroups } from '../lib/selectors'
import { leaves } from '../lib/tree'
import type { Item } from '../lib/types'
import { deckFile, deckFocus, setMode } from '../state/actions'
import { useStore } from '../state/store'

interface QuadrantProps {
  meta: QuadrantMeta
  items: Item[]
  currentId: string | null
  picked: Set<string>
  landed: { id: string; n: number } | null
  today: string
}

function QuadrantBox({ meta, items, currentId, picked, landed, today }: QuadrantProps) {
  const flash = landed && items.some((i) => i.id === landed.id) ? landed.n : null
  const home = items.some((i) => i.id === currentId)
  return (
    <section
      className="quad"
      data-q={meta.id}
      data-home={home || undefined}
      aria-label={`${meta.title}: ${meta.blurb}`}
    >
      {flash !== null && <span key={flash} className="quad__flash" />}
      {/* Only the heading files the card: a stray click in the list should never move a thought. */}
      <header className="quad__head" title={`File here. ${meta.hint}`} onMouseDown={keepFocus} onClick={() => deckFile('sort', meta.id)}>
        <span className="quad__keys">
          <Kbd k={meta.num} size="lg" className="quad__key" />
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
              picked={picked.has(it.id)}
              fresh={landed?.id === it.id}
              meta={it.slot ? shortDay(it.slot, today) : undefined}
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
  const pickedIds = useStore((s) => s.picked?.ids)
  const picked = useMemo(() => new Set(pickedIds), [pickedIds])
  const today = useStore((s) => s.today)

  // Parents are labels for their subtasks, so only the subtasks are sorted.
  const items = useMemo(() => leaves(live(all)), [all])
  const currentId = resolveSortCursor(all, deck.cursor)
  const current = items.find((i) => i.id === currentId) ?? null
  const unsorted = useMemo(() => items.filter((i) => !i.quadrant), [items])
  // Nothing left to sort: the card walks through the 2-minute tasks, to do them now.
  const running = !unsorted.length && current?.quadrant === 'quick'
  const quick = useMemo(() => quickLane(all), [all])
  const quickDone = useMemo(
    () => leaves(all).filter((i) => i.quadrant === 'quick' && doneDay(i) === today).length,
    [all, today],
  )
  const ahead = running ? quick.length - 1 : unsorted.filter((i) => i.id !== currentId).length

  const lastId = deck.trail.at(-1)
  const last = items.find((i) => i.id === lastId)
  const receipt: Receipt | null = last
    ? {
        item: last,
        label: last.quadrant ? QUADRANT_BY_ID[last.quadrant].title : 'Unsorted',
        tone: last.quadrant ?? 'none',
      }
    : null

  // Each lane lists its thoughts quickest first.
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
        label={running ? '2-minute · do it now' : 'Unsorted'}
        done={running ? quickDone : items.length - unsorted.length}
        total={running ? quickDone + quick.length : items.length}
        current={current}
        ahead={ahead}
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
          running ? (
            <>
              <Kbd k="mod+k" size="xs" /> done
              <span className="card__sep">·</span>
              <Kbd k="space" size="xs" /> next
              <span className="card__sep">·</span>
              <Kbd k="shift+3" size="xs" /> plan the rest
            </>
          ) : (
            <>
              <Kbd label="1–3" size="xs" /> file
              <span className="card__sep">·</span>
              <Kbd k="space" size="xs" /> skip
              <span className="card__sep">·</span>
              <Kbd k="enter" size="xs" /> open
            </>
          )
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
        {QUADRANTS.map((q) => (
          <QuadrantBox key={q.id} meta={q} items={byQuadrant[q.id]} currentId={currentId} picked={picked} landed={landed} today={today} />
        ))}
      </div>
    </div>
  )
}
