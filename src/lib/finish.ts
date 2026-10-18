import { planColumns } from './dates'
import { fmt, PRESETS } from './duration'
import { QUADRANTS } from './quadrants'
import type { Gap } from './selectors'
import type { Item, Quadrant } from './types'

// What → offers in Dump for each thing a thought can lack. The option's number is its key: the
// same numbers as Sort (quadrants, times) and Plan (days, with 8 for later).

export interface FinishOption {
  label: string
  hint: string
  /** The quadrant it files under, for colouring. */
  q?: Quadrant
  change: Partial<Item>
}

export const GAP_LABEL: Record<Gap, string> = { quadrant: 'priority', slot: 'day', minutes: 'time' }

export function finishOptions(gap: Gap, today: string): FinishOption[] {
  if (gap === 'quadrant') return QUADRANTS.map((q) => ({ label: q.title, hint: q.blurb, q: q.id, change: { quadrant: q.id } }))
  if (gap === 'slot') return planColumns(today).map((c) => ({ label: c.label, hint: c.sub, change: { slot: c.key } }))
  return PRESETS.map((m) => ({ label: fmt(m), hint: 'takes', change: { minutes: m } }))
}
