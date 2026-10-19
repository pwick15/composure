import { planColumns } from './dates'
import { fmt, PRESETS } from './duration'
import { QUADRANTS } from './quadrants'
import type { Item, Quadrant } from './types'

// The thought sheet shows everything about a thought as rows, one per field. Each row's options
// are numbered, and the number is the key that picks it: the same numbers Sort (quadrants) and
// Plan (days, 8 for later) use.

/** One thing about a thought that the sheet edits. */
export type Field = 'text' | 'quadrant' | 'slot' | 'minutes' | 'session'

export const FIELD_LABEL: Record<Field, string> = {
  text: 'text',
  quadrant: 'priority',
  slot: 'day',
  minutes: 'time',
  session: 'session',
}

export interface FieldOption {
  /** The key that picks it, shown on the chip. */
  n: number
  label: string
  hint: string
  /** The quadrant it files under, for colouring. */
  q?: Quadrant
  change: Partial<Item>
}

/** A work session a thought can go in: its number on that day, and what it's called. */
export interface SessionChoice {
  session: number
  label: string
}

/**
 * The options on a row. Sessions are numbered as they are stored, so "2" is always the second
 * session of the day even after the first one empties; the last option starts a new one.
 */
export function fieldOptions(field: Field, today: string, sessions: SessionChoice[] = []): FieldOption[] {
  if (field === 'quadrant') {
    return QUADRANTS.map((q, i) => ({ n: i + 1, label: q.title, hint: `${q.blurb}. ${q.hint}`, q: q.id, change: { quadrant: q.id } }))
  }
  if (field === 'slot') return planColumns(today).map((c, i) => ({ n: i + 1, label: c.label, hint: c.sub, change: { slot: c.key } }))
  if (field === 'minutes') return PRESETS.map((m, i) => ({ n: i + 1, label: fmt(m), hint: `takes ${fmt(m)}`, change: { minutes: m } }))
  if (field === 'session') {
    const next = Math.max(0, ...sessions.map((s) => s.session)) + 1
    return [
      ...sessions.map((s) => ({ n: s.session, label: s.label, hint: s.label, change: { session: s.session } })),
      { n: next, label: 'new', hint: 'Start a new session for it', change: { session: next } },
    ]
  }
  return []
}

/** What 0 clears on each row, and how a cleared value reads. Sessions can't be cleared, only moved. */
export const CLEARED: Partial<Record<Field, { change: Partial<Item>; label: string }>> = {
  quadrant: { change: { quadrant: null }, label: 'Unsorted' },
  slot: { change: { slot: null }, label: 'No day' },
  minutes: { change: { minutes: null }, label: 'No time' },
}
