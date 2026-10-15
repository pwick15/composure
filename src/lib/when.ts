import { addDays, dayKey, LATER, longDate, parseDay } from './dates'
import type { Slot } from './types'

// "When" understands the way people say a day: "tue", "next friday", "in 2 weeks", "3d", "24/12",
// "15 oct 2027". Day comes before month, as in dd/mm/yyyy. It returns every reasonable reading,
// best first, so a half-typed "t" can offer Today, Tomorrow, Tuesday and Thursday at once.

export interface WhenOption {
  /** The day it means, `later` for the open bucket, or null for "no day". */
  slot: Slot | null
  label: string
  hint: string
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const WEEKDAY_ALIASES: Record<number, string[]> = {
  0: ['sun'],
  1: ['mon'],
  2: ['tue', 'tues'],
  3: ['wed', 'weds'],
  4: ['thu', 'thur', 'thurs'],
  5: ['fri'],
  6: ['sat'],
}
const NUMBER_WORDS = 'a an one two three four five six seven eight nine ten eleven twelve'.split(' ')
const MAX_DAYS = 3650

const dayOfWeek = (key: string) => parseDay(key).getDay()
const daysBetween = (from: string, to: string) => Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000)

/** The next given weekday (0 = Sunday), always after `from`: asking for Tuesday on a Tuesday means next week's. */
const upcoming = (from: string, weekday: number) => addDays(from, ((weekday - dayOfWeek(from) + 6) % 7) + 1)

/** A valid calendar day, or null (31/02 is nothing). Two-digit years mean 20xx. */
function make(year: number, month: number, day: number): string | null {
  if (year < 100) year += 2000
  const d = new Date(year, month - 1, day)
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day ? dayKey(d) : null
}

function addMonths(key: string, n: number): string {
  const d = parseDay(key)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()))
  return dayKey(d)
}

/** The next time this day and month come round: this year if it hasn't passed, else next. */
function nextOccurrence(day: number, month: number, today: string): string | null {
  const year = parseDay(today).getFullYear()
  for (const y of [year, year + 1, year + 4]) {
    const hit = make(y, month, day)
    if (hit && hit >= today) return hit
  }
  return null
}

/** The next day-of-month that exists: "22" is the 22nd of this month, or next month once it has passed. */
function nextDayOfMonth(day: number, today: string): string | null {
  const start = parseDay(today)
  for (let i = 0; i < 14; i++) {
    const hit = make(start.getFullYear(), start.getMonth() + 1 + i, day)
    if (hit && hit >= today) return hit
  }
  return null
}

const monthIndex = (word: string) => (word.length >= 3 ? MONTHS.findIndex((m) => m.startsWith(word)) : -1)

function unitOf(word: string): 'day' | 'week' | 'month' | 'year' | null {
  const u = word.replace(/s$/, '')
  if (!u) return null
  if ('day'.startsWith(u)) return 'day'
  if (u === 'wk' || 'week'.startsWith(u)) return 'week'
  if (u === 'mth' || 'month'.startsWith(u)) return 'month'
  if (u === 'yr' || 'year'.startsWith(u)) return 'year'
  return null
}

function plus(today: string, n: number, unit: 'day' | 'week' | 'month' | 'year'): string | null {
  if (n > MAX_DAYS) return null
  if (unit === 'day') return addDays(today, n)
  if (unit === 'week') return addDays(today, n * 7)
  return addMonths(today, unit === 'month' ? n : n * 12)
}

/** Days, weeks and dates you can state outright: "in 2 days", "24/12/2026", "oct 15". */
function stated(q: string, today: string): (string | null)[] {
  let m: RegExpMatchArray | null

  if ((m = q.match(/^\+(\d+)$/))) return [plus(today, +m[1], 'day')]
  if ((m = q.match(/^(?:in )?(\d+) ?([a-z]+)$/)) || (m = q.match(new RegExp(`^(?:in )?(${NUMBER_WORDS.join('|')}) ([a-z]+)$`)))) {
    const n = /^\d+$/.test(m[1]) ? +m[1] : Math.max(1, NUMBER_WORDS.indexOf(m[1]) - 1)
    const unit = unitOf(m[2])
    // "3 oct" is a date, not three of something: leave it to the date readings below.
    if (unit && monthIndex(m[2]) === -1) return [plus(today, n, unit)]
  }

  if ((m = q.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return [make(+m[1], +m[2], +m[3])]
  if ((m = q.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/))) {
    return [m[3] ? make(+m[3], +m[2], +m[1]) : nextOccurrence(+m[1], +m[2], today)]
  }

  if ((m = q.match(/^(\d{1,2})(?:st|nd|rd|th)? ?([a-z]{3,9})(?: (\d{4}))?$/)) && monthIndex(m[2]) !== -1) {
    return [m[3] ? make(+m[3], monthIndex(m[2]) + 1, +m[1]) : nextOccurrence(+m[1], monthIndex(m[2]) + 1, today)]
  }
  if ((m = q.match(/^([a-z]{3,9}) ?(\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/)) && monthIndex(m[1]) !== -1) {
    return [m[3] ? make(+m[3], monthIndex(m[1]) + 1, +m[2]) : nextOccurrence(+m[2], monthIndex(m[1]) + 1, today)]
  }
  if ((m = q.match(/^(\d{1,2})(?:st|nd|rd|th)?$/))) return [nextDayOfMonth(+m[1], today)]
  return []
}

/** The weekdays a typed prefix could mean ("t" → Tue and Thu), soonest first. */
function weekdaysFor(q: string, today: string): string[] {
  const hits = WEEKDAYS.flatMap((name, i) =>
    name.startsWith(q) || WEEKDAY_ALIASES[i].some((a) => a === q || a.startsWith(q)) ? [upcoming(today, i)] : [],
  )
  return hits.sort()
}

const startsWith = (words: string[], q: string) => words.some((w) => w.startsWith(q))

/** Every reading of a typed phrase, as slots, best first. */
function slotsFor(input: string, today: string): (Slot | null)[] {
  let q = input.toLowerCase().trim().replace(/\s+/g, ' ').replace(/^(?:on|by|for|this) /, '')
  const next = /^next /.test(q)
  q = q.replace(/^next /, '')
  if (!q) return []

  const out: (Slot | null)[] = []
  if (next) {
    const endOfWeek = addDays(today, (7 - dayOfWeek(today)) % 7)
    for (const day of weekdaysFor(q, today)) out.push(day <= endOfWeek ? addDays(day, 7) : day)
    if (startsWith(['week'], q)) out.push(upcoming(today, 1))
    if (startsWith(['month'], q)) out.push(addMonths(today, 1).slice(0, 8) + '01')
    return out
  }

  // A reading that isn't a real day (31/02) comes back null, which must not be mistaken for "no day".
  out.push(...stated(q, today).filter((s) => s !== null))
  if (startsWith(['today', 'tonight'], q)) out.push(today)
  if (startsWith(['tomorrow', 'tmrw', 'tmr', 'tom'], q)) out.push(addDays(today, 1))
  out.push(...weekdaysFor(q, today))
  if (startsWith(['weekend'], q)) out.push(weekendOf(today))
  if (startsWith(['next week'], q)) out.push(upcoming(today, 1))
  if (startsWith(['next month'], q)) out.push(addMonths(today, 1).slice(0, 8) + '01')
  if (startsWith(['later', 'someday'], q)) out.push(LATER)
  if (startsWith(['none', 'clear', 'unplan', 'anytime', 'no day'], q)) out.push(null)
  return out
}

/** This weekend: today if it already is the weekend, else the coming Saturday. */
const weekendOf = (today: string) => ([0, 6].includes(dayOfWeek(today)) ? today : upcoming(today, 6))

/** "Tuesday" / "Tue 20 Oct" for what a day is called, with a hint of how far off it is. */
function describe(slot: Slot | null, today: string): { label: string; hint: string } {
  if (slot === null) return { label: 'No day', hint: 'Back to unplanned' }
  if (slot === LATER) return { label: 'Later', hint: 'Not this week' }
  const n = daysBetween(today, slot)
  const date = longDate(slot)
  const year = parseDay(slot).getFullYear()
  const dated = year === parseDay(today).getFullYear() ? date : `${date} ${year}`
  if (n === 0) return { label: 'Today', hint: date }
  if (n === 1) return { label: 'Tomorrow', hint: date }
  if (n < 7) return { label: WEEKDAYS[dayOfWeek(slot)].replace(/^./, (c) => c.toUpperCase()), hint: date }
  const far = n < 14 ? `in ${n} days` : n < 60 ? `in ${Math.round(n / 7)} weeks` : `in ${Math.round(n / 30)} months`
  return { label: dated, hint: far }
}

/**
 * What to offer for what's been typed. Nothing typed gives the usual picks; a phrase gives its
 * readings, soonest sensible first. Days already gone are never offered. `current` is the thought's
 * present slot, so "No day" only shows when there is a day to remove.
 */
export function whenOptions(input: string, today: string, current: Slot | null): WhenOption[] {
  const slots: (Slot | null)[] = input.trim()
    ? slotsFor(input, today)
    : [today, addDays(today, 1), weekendOf(today), upcoming(today, 1), LATER, ...(current !== null ? [null] : [])]
  const seen = new Set<Slot | null>()
  return slots
    .filter((s) => s === null || s === LATER || s >= today)
    .filter((s) => !seen.has(s) && seen.add(s))
    .map((slot) => ({ slot, ...describe(slot, today) }))
}
