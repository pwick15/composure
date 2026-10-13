import { isOverdue, slotLabel } from '../lib/dates'
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

export function SlotTag({ item, today }: { item: Item; today: string }) {
  if (!item.slot) return null
  return (
    <span className={`tag ${isOverdue(item.slot, today) ? 'tag--overdue' : ''}`}>{slotLabel(item.slot, today)}</span>
  )
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
