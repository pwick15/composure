import { columnFor, dayKey, isDateSlot, isOverdue, planColumns } from './dates'
import { effMinutes } from './session'
import { QUADRANTS, QUADRANT_RANK } from './quadrants'
import { childrenOf, leaves, parentIds } from './tree'
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

// ---------------------------------------------------------------- archive
//
// A thought you finish goes straight to the Archive and leaves every other screen. Nothing is
// moved or copied: it is a question of whether it is done, so ⌘Z and reopening just work.

/** The day a done thought was ticked off, or null when it is open or nobody recorded when. */
export const doneDay = (i: Item): string | null => (i.done && i.doneAt !== null ? dayKey(new Date(i.doneAt)) : null)

/**
 * What the Archive holds: every finished thought. A thought with subtasks goes once every
 * subtask has, and takes them along, so the last tick closes the whole plan.
 */
export function archivedIds(all: Item[]): Set<string> {
  const ids = new Set(all.map((i) => i.id))
  const kids = new Map<string, Item[]>()
  for (const i of all) {
    if (i.parentId && ids.has(i.parentId)) kids.set(i.parentId, [...(kids.get(i.parentId) ?? []), i])
  }
  const out = new Set<string>()
  for (const i of all) {
    const sub = kids.get(i.id)
    if (!sub) {
      if (i.done) out.add(i.id)
    } else if (sub.every((k) => k.done)) {
      out.add(i.id)
      for (const k of sub) out.add(k.id)
    }
  }
  return out
}

/** Everything except the archive: what Dump, Sort, Plan and Today work with. */
export function live(all: Item[]): Item[] {
  const gone = archivedIds(all)
  return gone.size ? all.filter((i) => !gone.has(i.id)) : all
}

/** The archive grouped by the day each thing was done, latest first. Undated ones go at the end. */
export function archiveDays(all: Item[]): { day: string | null; items: Item[] }[] {
  const gone = archivedIds(all)
  const items = leaves(all)
    .filter((i) => gone.has(i.id))
    .sort((a, b) => (b.doneAt ?? -1) - (a.doneAt ?? -1))
  const days: { day: string | null; items: Item[] }[] = []
  for (const item of items) {
    const day = doneDay(item)
    const last = days.at(-1)
    if (last && last.day === day) last.items.push(item)
    else days.push({ day, items: [item] })
  }
  return days
}

/** The order ↑/↓ walks in the Archive. */
export const archiveOrder = (all: Item[]): Item[] => archiveDays(all).flatMap((d) => d.items)

export function resolveArchiveCursor(all: Item[], cursor: string | null): string | null {
  const list = archiveOrder(all)
  return (list.find((i) => i.id === cursor) ?? list[0])?.id ?? null
}

// ---------------------------------------------------------------- dump
//
// Dump is for getting things out of your head. Once a thought has a priority, a day and a time it
// has been dealt with, so Dump tucks it away (it is still in Sort, Plan and Today). What it
// still lacks is what → fills in.

/** The three things a thought needs before it is dealt with, in the order they are asked for. */
export type Gap = 'quadrant' | 'slot' | 'minutes'
export const GAPS: Gap[] = ['quadrant', 'slot', 'minutes']

/** What a thought still lacks. A dropped one is let go of, so it needs no day or time. */
export const gapsOf = (i: Item): Gap[] => (i.quadrant === 'drop' ? [] : GAPS.filter((g) => i[g] === null))

/**
 * The thoughts Dump tucks away: actionable ones with nothing missing, and parents whose open
 * subtasks are all tucked away.
 */
export function settled(all: Item[]): Set<string> {
  const items = live(all)
  const away = new Set(leaves(items).filter((i) => !gapsOf(i).length).map((i) => i.id))
  for (const id of parentIds(items)) {
    if (childrenOf(items, id).every((k) => away.has(k.id))) away.add(id)
  }
  return away
}

/** What Dump lists: every open thought, less the tucked-away ones unless `showAll`. */
export function visibleInDump(all: Item[], showAll: boolean): Item[] {
  const items = live(all)
  if (showAll) return items
  const away = settled(all)
  return away.size ? items.filter((i) => !away.has(i.id)) : items
}

// ---------------------------------------------------------------- sort

/** Sort's lists in reading order: the unsorted queue, then Do, Schedule, Delegate, Drop. */
export function sortGroups(all: Item[]): Item[][] {
  const items = leaves(live(all))
  return [
    items.filter((i) => !i.quadrant),
    ...QUADRANTS.map((q) => items.filter((i) => i.quadrant === q.id).sort(shorterFirst)),
  ]
}

/** The order ↑/↓ walks in Sort. */
export const sortOrder = (items: Item[]) => sortGroups(items).flat()

/** The stored cursor if it still exists, else the first unsorted item. */
export function resolveSortCursor(all: Item[], cursor: string | null): string | null {
  const items = leaves(live(all))
  if (cursor && items.some((i) => i.id === cursor)) return cursor
  return items.find((i) => !i.quadrant)?.id ?? null
}

// ---------------------------------------------------------------- plan

export const isPlannable = (item: Item) => item.quadrant !== 'drop'

/** Items still waiting for a day: overdue first, then by quadrant priority, then list order. */
export function planQueue(all: Item[], today: string): Item[] {
  return leaves(live(all))
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isPlannable(item) && columnFor(item.slot, today) === null)
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
  return leaves(live(all))
    .filter((i) => isPlannable(i) && columnFor(i.slot, today) === col)
    .sort(tackleOrder)
}

// ---------------------------------------------------------------- today

/**
 * Today's plan, one work session after another. Inside a session anything overdue comes first,
 * then quadrant by quadrant, quickest first. Only what is still open is here: a task you tick
 * off goes to the Archive (and into `todayProgress`).
 */
export function todayList(all: Item[], today: string): Item[] {
  const items = leaves(live(all)).filter((i) => isPlannable(i) && (i.slot === today || isOverdue(i.slot, today)))
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
  todayList(items, today).filter((i) => i.session === session)

export function resolveTodayCursor(items: Item[], cursor: string | null, today: string): string | null {
  const list = todayList(items, today)
  return (list.find((i) => i.id === cursor) ?? list[0])?.id ?? null
}

/**
 * How far through today you are: what was ticked off today (archived by now) out of everything
 * that was on today's plate. Finishing something planned for a later day doesn't count.
 */
export function todayProgress(all: Item[], today: string): { done: number; total: number } {
  const done = leaves(all).filter(
    (i) => isPlannable(i) && doneDay(i) === today && isDateSlot(i.slot) && i.slot <= today,
  ).length
  return { done, total: done + todayList(all, today).length }
}

/** Time still to go today. A task with no estimate counts as a default-length one, as a session would. */
export function timeLeft(items: Item[], today: string) {
  const open = todayList(items, today)
  return {
    minutes: open.reduce((n, i) => n + effMinutes(i), 0),
    unestimated: open.filter((i) => i.minutes === null).length,
    open: open.length,
  }
}
