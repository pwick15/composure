import type { Quadrant } from './types'

export interface QuadrantMeta {
  id: Quadrant
  key: string
  num: string
  title: string
  blurb: string
  hint: string
  row: 0 | 1
  col: 0 | 1
}

// Layout follows the classic Eisenhower grid: urgency across, importance down.
// QWAS mirrors the grid on the keyboard: Q W on the top row, A S below.
export const QUADRANTS: QuadrantMeta[] = [
  {
    id: 'do',
    key: 'q',
    num: '1',
    title: 'Do',
    blurb: 'Urgent · Important',
    hint: 'Deadlines and fires. Handle these first.',
    row: 0,
    col: 0,
  },
  {
    id: 'schedule',
    key: 'w',
    num: '2',
    title: 'Schedule',
    blurb: 'Not urgent · Important',
    hint: 'The things that move life forward. Give them a day.',
    row: 0,
    col: 1,
  },
  {
    id: 'delegate',
    key: 'a',
    num: '3',
    title: 'Delegate',
    blurb: 'Urgent · Not important',
    hint: 'Hand off, automate, or batch and do fast.',
    row: 1,
    col: 0,
  },
  {
    id: 'drop',
    key: 's',
    num: '4',
    title: 'Drop',
    blurb: 'Not urgent · Not important',
    hint: 'Let it go. Out of your head is the point.',
    row: 1,
    col: 1,
  },
]

export const QUADRANT_BY_ID = Object.fromEntries(QUADRANTS.map((q) => [q.id, q])) as Record<
  Quadrant,
  QuadrantMeta
>

export const QUADRANT_RANK: Record<Quadrant, number> = { do: 0, schedule: 1, delegate: 2, drop: 3 }
