import type { Quadrant } from './types'

export interface QuadrantMeta {
  id: Quadrant
  /** The key that files a thought here, in Sort and on the thought sheet. */
  num: string
  title: string
  blurb: string
  hint: string
  row: 0 | 1
  col: 0 | 1
}

// Layout follows the classic Eisenhower grid: urgency across, importance down. The numbers read
// the grid like a page, 1 2 on top and 3 4 below, and digits never start a search.
export const QUADRANTS: QuadrantMeta[] = [
  {
    id: 'do',
    num: '1',
    title: 'Do',
    blurb: 'Urgent · Important',
    hint: 'A real deadline, and it matters to you. Handle these first.',
    row: 0,
    col: 0,
  },
  {
    id: 'schedule',
    num: '2',
    title: 'Schedule',
    blurb: 'Not urgent · Important',
    hint: 'Matters to you, with no clock on it yet. Give it a day.',
    row: 0,
    col: 1,
  },
  {
    id: 'delegate',
    num: '3',
    title: "Someone else's",
    blurb: 'Urgent · Not important',
    hint: "Someone else's deadline landing on you: a favour, a chase-up, an invite. Hand it off, do it fast, or say no.",
    row: 1,
    col: 0,
  },
  {
    id: 'drop',
    num: '4',
    title: 'Let go',
    blurb: 'Not urgent · Not important',
    hint: "Guilt, habit, or a 'should' you don't want. Writing it down was enough; let it go.",
    row: 1,
    col: 1,
  },
]

export const QUADRANT_BY_ID = Object.fromEntries(QUADRANTS.map((q) => [q.id, q])) as Record<
  Quadrant,
  QuadrantMeta
>

export const QUADRANT_RANK: Record<Quadrant, number> = { do: 0, schedule: 1, delegate: 2, drop: 3 }
