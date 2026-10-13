import { DEFAULT_FOCUS } from './duration'
import type { Item } from './types'

// A work session walks through a list of today's tasks one at a time. Each task gets a window as
// long as its estimate; when the window closes the next task takes over, whether or not the last
// one was ticked off. Ticking one off early starts the next window straight away.

const MINUTE = 60_000

export interface Run {
  /** Which session of the day this is (the `session` on its tasks). */
  session: number
  /** The tasks in the order they come up, fixed when the session starts. */
  queue: string[]
  /** Whose window is open. */
  index: number
  /** When that window opened. */
  startedAt: number
  /** "over" once every window has closed; what's still open is then up to you. */
  phase: 'running' | 'over'
}

/** How long a task's window is: its estimate, or a default when it has none. */
export const effMinutes = (i: Item) => i.minutes ?? DEFAULT_FOCUS

export const startRun = (session: number, tasks: Item[], now: number): Run | null =>
  tasks.length ? { session, queue: tasks.map((t) => t.id), index: 0, startedAt: now, phase: 'running' } : null

export const activeId = (run: Run): string | null => (run.phase === 'running' ? (run.queue[run.index] ?? null) : null)

/** The queued tasks that still need doing, in queue order. */
export const leftovers = (run: Run, open: Set<string>): string[] => run.queue.filter((id) => open.has(id))

/**
 * Moves the session on to `now`: windows that have closed hand over to the next open task, and
 * a task that was ticked off, deleted or moved away is skipped (its successor starts now).
 * Returns the same `run` object when nothing changed, and which tasks ran out of time.
 */
export function advance(run: Run, items: Item[], open: Set<string>, now: number): { run: Run; timedOut: string[] } {
  const byId = new Map(items.map((i) => [i.id, i]))
  const nextOpen = (r: Run) => {
    for (let k = r.index + 1; k < r.queue.length; k++) if (open.has(r.queue[k])) return k
    return -1
  }
  const timedOut: string[] = []
  let r = run
  while (r.phase === 'running') {
    const id = r.queue[r.index]
    const next = nextOpen(r)
    if (!open.has(id)) {
      r = next === -1 ? { ...r, phase: 'over' } : { ...r, index: next, startedAt: now }
      continue
    }
    const end = r.startedAt + effMinutes(byId.get(id)!) * MINUTE
    if (now < end) break
    timedOut.push(id)
    r = next === -1 ? { ...r, phase: 'over' } : { ...r, index: next, startedAt: end }
  }
  return { run: r, timedOut }
}

/** Time until every window in the session has closed, if nothing is ticked off early. */
export function remainingMs(run: Run, items: Item[], open: Set<string>, now: number): number {
  if (run.phase === 'over') return 0
  const byId = new Map(items.map((i) => [i.id, i]))
  const active = byId.get(run.queue[run.index])
  const current = active ? Math.max(0, run.startedAt + effMinutes(active) * MINUTE - now) : 0
  const after = run.queue
    .slice(run.index + 1)
    .filter((id) => open.has(id))
    .reduce((ms, id) => ms + effMinutes(byId.get(id)!) * MINUTE, 0)
  return current + after
}

/** The active task's window: when it opened and how long it is. */
export function windowOf(run: Run, items: Item[]): { start: number; ms: number } | null {
  const id = activeId(run)
  const item = id ? items.find((i) => i.id === id) : undefined
  return item ? { start: run.startedAt, ms: effMinutes(item) * MINUTE } : null
}

/** 3,725,000 → "1:02:05"; 754,000 → "12:34". */
export function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}
