import { columnFor, isOverdue, planColumns } from './dates'
import { QUADRANTS, QUADRANT_RANK } from './quadrants'
import type { Item } from './types'

// ---------------------------------------------------------------- sort

/** Order J/K walks in Sort: unsorted first, then each quadrant in grid order. */
export function sortOrder(items: Item[]): Item[] {
  return [
    ...items.filter((i) => !i.quadrant),
    ...QUADRANTS.flatMap((q) => items.filter((i) => i.quadrant === q.id)),
  ]
}

/** The stored cursor if it still exists, else the first unsorted item. */
export function resolveSortCursor(items: Item[], cursor: string | null): string | null {
  if (cursor && items.some((i) => i.id === cursor)) return cursor
  return items.find((i) => !i.quadrant)?.id ?? null
}

/** Next unsorted item after `currentId` in list order, wrapping around. */
export function nextUnsorted(items: Item[], currentId: string): string | null {
  const start = items.findIndex((i) => i.id === currentId)
  const n = items.length
  for (let k = 1; k <= n; k++) {
    const it = items[(start + k + n) % n]
    if (it.id !== currentId && !it.quadrant) return it.id
  }
  return null
}

// ---------------------------------------------------------------- plan

export const isPlannable = (item: Item) => item.quadrant !== 'drop'

/** Items still waiting for a day: overdue first, then by quadrant priority, then list order. */
export function planQueue(items: Item[], today: string): Item[] {
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isPlannable(item) && !item.done && columnFor(item.slot, today) === null)
    .sort((a, b) => {
      const overdue = Number(isOverdue(b.item.slot, today)) - Number(isOverdue(a.item.slot, today))
      if (overdue) return overdue
      const rank = (i: Item) => (i.quadrant ? QUADRANT_RANK[i.quadrant] : 3)
      return rank(a.item) - rank(b.item) || a.index - b.index
    })
    .map(({ item }) => item)
}

/** Order J/K walks in Plan: the queue, then planned items column by column. */
export function planOrder(items: Item[], today: string): Item[] {
  const planned = planColumns(today).flatMap((col) =>
    items.filter((i) => isPlannable(i) && columnFor(i.slot, today) === col.key),
  )
  return [...planQueue(items, today), ...planned]
}

export function resolvePlanCursor(items: Item[], cursor: string | null, today: string): string | null {
  if (cursor && planOrder(items, today).some((i) => i.id === cursor)) return cursor
  return planQueue(items, today)[0]?.id ?? null
}

export function nextInQueue(queue: Item[], currentId: string): string | null {
  const start = queue.findIndex((i) => i.id === currentId)
  const n = queue.length
  for (let k = 1; k <= n; k++) {
    const it = queue[(start + k + n) % n]
    if (it.id !== currentId) return it.id
  }
  return null
}

export function itemsInColumn(items: Item[], col: string, today: string): Item[] {
  return items.filter((i) => isPlannable(i) && columnFor(i.slot, today) === col)
}
