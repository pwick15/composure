import { isOverdue, slotLabel } from '../lib/dates'
import { fmt } from '../lib/duration'
import { QUADRANT_BY_ID } from '../lib/quadrants'
import type { Item } from '../lib/types'
import { useStore } from '../state/store'

export function QuadrantTag({ item }: { item: Item }) {
  if (!item.quadrant) return <span className="tag tag--muted">Unsorted</span>
  return (
    <span className="tag" data-q={item.quadrant}>
      {QUADRANT_BY_ID[item.quadrant].title}
    </span>
  )
}

export function SlotTag({ item, today, done = item.done }: { item: Item; today: string; done?: boolean }) {
  if (!item.slot) return null
  const late = !done && isOverdue(item.slot, today)
  return <span className={`tag ${late ? 'tag--overdue' : ''}`}>{slotLabel(item.slot, today, done)}</span>
}

/** "~30m". With `nudge`, a thought with no estimate says so instead of showing nothing. */
export function TimeTag({ item, nudge = false, minutes = item.minutes }: { item: Item; nudge?: boolean; minutes?: number | null }) {
  if (minutes) return <span className="tag tag--time" title="Estimated time">~{fmt(minutes)}</span>
  return nudge ? <span className="tag tag--muted">no time</span> : null
}

export function DoneTag({ item, done = item.done }: { item: Item; done?: boolean }) {
  return done ? <span className="tag tag--done">Done</span> : null
}

/** "↳ Plan trip": which thought a subtask belongs to, wherever the subtask shows up. */
export function ParentRef({ item, className = '' }: { item: Item; className?: string }) {
  const text = useStore((s) => (item.parentId ? s.items.find((i) => i.id === item.parentId)?.text : undefined))
  if (!text) return null
  return (
    <span className={`parent-ref ${className}`} title={`Part of "${text}"`}>
      <span aria-hidden>↳</span> {text}
    </span>
  )
}
