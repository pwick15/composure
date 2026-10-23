import type { Quadrant } from './types'

export interface QuadrantMeta {
  id: Quadrant
  /** The key that files a thought here, in Sort and on the thought sheet. */
  num: string
  title: string
  blurb: string
  hint: string
}

// Sort's lanes, left to right. What you chose to do is split from what you have to do to keep
// life running, and anything quicker to do than to plan gets done straight after sorting.
// Deciding when happens in Plan, so there is no Schedule lane.
export const QUADRANTS: QuadrantMeta[] = [
  {
    id: 'do',
    num: '1',
    title: 'Do',
    blurb: 'By choice',
    hint: "Curiosity, ambition, the work you chose. The hard things you'd be proud to have done.",
  },
  {
    id: 'admin',
    num: '2',
    title: 'Admin',
    blurb: 'Have to',
    hint: 'Money, health, family, appointments, what you owe people. Clear it in one batch.',
  },
  {
    id: 'quick',
    num: '3',
    title: '2-minute',
    blurb: 'Under 2 minutes',
    hint: "Quicker to do than to plan. Once everything's sorted, you do these straight away.",
  },
]

export const QUADRANT_BY_ID = Object.fromEntries(QUADRANTS.map((q) => [q.id, q])) as Record<
  Quadrant,
  QuadrantMeta
>

export const QUADRANT_RANK: Record<Quadrant, number> = { do: 0, admin: 1, quick: 2 }

// Before the lanes, Sort was an Eisenhower matrix. Do and Schedule were your own work, Someone
// else's was mostly favours and chase-ups, and Let go has no lane, so it goes back to unsorted.
const RENAMED: Record<string, Quadrant> = { schedule: 'do', delegate: 'admin' }

/** The lane for a stored value, including the old quadrants. Anything else is unsorted. */
export function upgradeQuadrant(value: unknown): Quadrant | null {
  if (typeof value !== 'string') return null
  if (Object.hasOwn(QUADRANT_BY_ID, value)) return value as Quadrant
  return RENAMED[value] ?? null
}
