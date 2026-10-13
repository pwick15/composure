import type { Item } from './types'

/** The estimates -/= step through. Stepping down from the first one clears it. */
export const LADDER = [5, 10, 15, 25, 30, 45, 60, 90, 120, 180, 240]

/** What 1–6 set in Sort: one key per common size. */
export const PRESETS = [5, 15, 30, 60, 120, 240]

/** What a work session assumes for a thought with no estimate. */
export const DEFAULT_FOCUS = 25

/** 45 → "45m", 60 → "1h", 90 → "1h 30m". */
export function fmt(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (!h) return `${m}m`
  return m ? `${h}h ${m}m` : `${h}h`
}

/** One step longer (+1) or shorter (-1). From nothing: 15m up, 5m down. Below the shortest: none. */
export function stepMinutes(current: number | null, dir: 1 | -1): number | null {
  if (current === null) return dir > 0 ? 15 : 5
  if (dir > 0) return LADDER.find((m) => m > current) ?? current
  return [...LADDER].reverse().find((m) => m < current) ?? null
}

export const sumMinutes = (items: Item[]): number => items.reduce((n, i) => n + (i.minutes ?? 0), 0)

/** Valid estimates are whole minutes up to a day; anything else (e.g. from a hand-edited backup) is none. */
export const cleanMinutes = (m: unknown): number | null =>
  typeof m === 'number' && Number.isInteger(m) && m > 0 && m <= 1440 ? m : null
