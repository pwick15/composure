import { isOverdue, slotLabel } from '../lib/dates'
import { QUADRANT_BY_ID } from '../lib/quadrants'
import type { Item } from '../lib/types'

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

export function DoneTag({ item }: { item: Item }) {
  return item.done ? <span className="tag tag--done">Done</span> : null
}
