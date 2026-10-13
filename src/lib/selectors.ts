import { columnFor, isOverdue, planColumns } from './dates'
import { effMinutes } from './session'
import { QUADRANTS, QUADRANT_RANK } from './quadrants'
import { leaves } from './tree'
import type { Item } from './types'

// ---------------------------------------------------------------- order
//
// Within a quadrant, quick things come first: finishing them early is momentum, and it clears
// the list fastest. Things with no estimate go last, since nobody knows how long they take.

const rankOf = (i: Item) => (i.quadrant ? QUADRANT_RANK[i.quadrant] : 3)
const length = (i: Item) => i.minutes ?? Infinity
const shorterFirst = (a: Item, b: Item) => (length(a) === length(b) ? 0 : length(a) < length(b) ? -1 : 1)

/** Quadrant first, then shortest to longest. The sort is stable, so ties keep Dump order. */
const tackleOrder = (a: Item, b: Item) => rankOf(a) - rankOf(b) || shorterFirst(a, b)

// ---------------------------------------------------------------- sort

/** Sort's lists in reading order: the unsorted queue, then Do, Schedule, Delegate, Drop. */
export function sortGroups(all: Item[]): Item[][] {
  const items = leaves(all)
  return [
    items.filter((i) => !i.quadrant),
    ...QUADRANTS.map((q) => items.filter((i) => i.quadrant === q.id).sort(shorterFirst)),
  ]
}

/** The order ↑/↓ walks in Sort. */
export const sortOrder = (items: Item[]) => sortGroups(items).flat()

/** The stored cursor if it still exists, else the first unsorted item. */
export function resolveSortCursor(all: Item[], cursor: string | null): string | null {
  const items = leaves(all)
  if (cursor && items.some((i) => i.id === cursor)) return cursor
  return items.find((i) => !i.quadrant)?.id ?? null
}

// ---------------------------------------------------------------- plan

export const isPlannable = (item: Item) => item.quadrant !== 'drop'

/** Items still waiting for a day: overdue first, then by quadrant priority, then list order. */
export function planQueue(all: Item[], today: string): Item[] {
  return leaves(all)
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isPlannable(item) && !item.done && columnFor(item.slot, today) === null)
    .sort((a, b) => {
      const overdue = Number(isOverdue(b.item.slot, today)) - Number(isOverdue(a.item.slot, today))
      if (overdue) return overdue
      return tackleOrder(a.item, b.item) || a.index - b.index
    })
    .map(({ item }) => item)
}

/** Plan's lists in reading order: the unplanned queue, then each day, then Later. */
export function planGroups(items: Item[], today: string): Item[][] {
  return [planQueue(items, today), ...planColumns(today).map((col) => itemsInColumn(items, col.key, today))]
}

/** The order ↑/↓ walks in Plan. */
export const planOrder = (items: Item[], today: string) => planGroups(items, today).flat()

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

export function itemsInColumn(all: Item[], col: string, today: string): Item[] {
  return leaves(all)
    .filter((i) => isPlannable(i) && columnFor(i.slot, today) === col)
    .sort(tackleOrder)
}

// ---------------------------------------------------------------- today

/**
 * Today's plan, one work session after another. Inside a session anything overdue comes first,
 * then quadrant by quadrant, quickest first.
 */
export function todayList(all: Item[], today: string): Item[] {
  const items = leaves(all).filter((i) => isPlannable(i) && (i.slot === today || (!i.done && isOverdue(i.slot, today))))
  const late = (i: Item) => Number(isOverdue(i.slot, today))
  return items.sort((a, b) => a.session - b.session || late(b) - late(a) || tackleOrder(a, b))
}

/** Today's plan split into its work sessions, in order. Empty sessions don't exist. */
export function todaySessions(items: Item[], today: string): { session: number; items: Item[] }[] {
  const groups: { session: number; items: Item[] }[] = []
  for (const item of todayList(items, today)) {
    const last = groups.at(-1)
    if (last?.session === item.session) last.items.push(item)
    else groups.push({ session: item.session, items: [item] })
  }
  return groups
}

/** The tasks of a session that still need doing. */
export const openInSession = (items: Item[], today: string, session: number): Item[] =>
  todayList(items, today).filter((i) => !i.done && i.session === session)

export function resolveTodayCursor(items: Item[], cursor: string | null, today: string): string | null {
  const list = todayList(items, today)
  if (cursor && list.some((i) => i.id === cursor)) return cursor
  return (list.find((i) => !i.done) ?? list[0])?.id ?? null
}

/** The numbers that show how much lighter things are: total out of your head, let go, and on today. */
export function clarity(items: Item[], today: string) {
  const list = todayList(items, today)
  return {
    total: items.length,
    dropped: leaves(items).filter((i) => i.quadrant === 'drop').length,
    today: list.length,
    doneToday: list.filter((i) => i.done).length,
  }
}

/** Time still to go today. A task with no estimate counts as a default-length one, as a session would. */
export function timeLeft(items: Item[], today: string) {
  const open = todayList(items, today).filter((i) => !i.done)
  return {
    minutes: open.reduce((n, i) => n + effMinutes(i), 0),
    unestimated: open.filter((i) => i.minutes === null).length,
    open: open.length,
  }
}
