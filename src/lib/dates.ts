import type { Slot } from './types'

export const LATER = 'later'
export const WINDOW_DAYS = 7

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const pad = (n: number) => String(n).padStart(2, '0')

/** Local-time day key, YYYY-MM-DD. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayKey(now = new Date()): string {
  return dayKey(now)
}

export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(key: string, n: number): string {
  const d = parseDay(key)
  d.setDate(d.getDate() + n)
  return dayKey(d)
}

export interface DayColumn {
  key: Slot
  label: string
  sub: string
  weekend: boolean
  today: boolean
}

/** Today plus the next six days, then the open "Later" bucket. */
export function planColumns(today: string): DayColumn[] {
  const days: DayColumn[] = []
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const key = addDays(today, i)
    const d = parseDay(key)
    days.push({
      key,
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : WEEKDAY[d.getDay()],
      sub: `${WEEKDAY[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]}`,
      weekend: d.getDay() === 0 || d.getDay() === 6,
      today: i === 0,
    })
  }
  days.push({ key: LATER, label: 'Later', sub: 'Not this week', weekend: false, today: false })
  return days
}

export function windowEnd(today: string): string {
  return addDays(today, WINDOW_DAYS - 1)
}

export function isDateSlot(slot: Slot | null): slot is string {
  return slot !== null && slot !== LATER
}

export function isOverdue(slot: Slot | null, today: string): boolean {
  return isDateSlot(slot) && slot < today
}

/** Which plan column an item's slot falls into, or null when it is unplanned or overdue. */
export function columnFor(slot: Slot | null, today: string): Slot | null {
  if (slot === null) return null
  if (slot === LATER) return LATER
  if (slot < today) return null
  if (slot > windowEnd(today)) return LATER
  return slot
}

/** A finished thought was never late, so with `done` a past day is just a date. */
export function slotLabel(slot: Slot, today: string, done = false): string {
  if (slot === LATER) return 'Later'
  if (slot === today) return 'Today'
  if (slot === addDays(today, 1)) return 'Tomorrow'
  const d = parseDay(slot)
  const short = `${WEEKDAY[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]}`
  if (slot < today && !done) return `Overdue · ${short}`
  return short
}

export function weekdayShort(slot: Slot, today: string): string {
  if (slot === LATER) return 'Later'
  if (slot === today) return 'Today'
  return WEEKDAY[parseDay(slot).getDay()]
}

export function longDate(key: string): string {
  const d = parseDay(key)
  return `${WEEKDAY[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]}`
}
