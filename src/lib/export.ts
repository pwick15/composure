import { addDays, columnFor, isDateSlot, LATER, longDate, planColumns } from './dates'
import { QUADRANTS, QUADRANT_BY_ID } from './quadrants'
import { isPlannable, planQueue } from './selectors'
import type { Item } from './types'

const box = (i: Item) => `- [${i.done ? 'x' : ' '}] ${i.text}`

export function planMarkdown(items: Item[], today: string): string {
  const out = [`# Plan · ${longDate(today)}`]
  for (const col of planColumns(today)) {
    const list = items.filter((i) => isPlannable(i) && columnFor(i.slot, today) === col.key)
    if (!list.length) continue
    const heading =
      col.key === LATER ? 'Later' : col.label === col.sub.slice(0, 3) ? col.sub : `${col.label} · ${col.sub}`
    out.push('', `## ${heading}`, ...list.map(box))
  }
  const rest = planQueue(items, today)
  if (rest.length) {
    out.push('', '## Not planned yet')
    out.push(...rest.map((i) => `${box(i)}${i.quadrant ? ` (${QUADRANT_BY_ID[i.quadrant].title})` : ''}`))
  }
  return out.join('\n') + '\n'
}

export function matrixMarkdown(items: Item[]): string {
  const out = ['# Priorities']
  for (const q of QUADRANTS) {
    const list = items.filter((i) => i.quadrant === q.id)
    if (!list.length) continue
    out.push('', `## ${q.title} (${q.blurb})`, ...list.map(box))
  }
  const unsorted = items.filter((i) => !i.quadrant)
  if (unsorted.length) out.push('', '## Unsorted', ...unsorted.map(box))
  return out.join('\n') + '\n'
}

// ---------------------------------------------------------------- iCalendar

const icsEscape = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

const encoder = new TextEncoder()

/** RFC 5545 line folding at 75 octets without splitting multi-byte characters. */
function fold(line: string): string {
  if (encoder.encode(line).length <= 75) return line
  const parts: string[] = []
  let current = ''
  let bytes = 0
  for (const ch of line) {
    const size = encoder.encode(ch).length
    const limit = parts.length === 0 ? 75 : 74
    if (bytes + size > limit) {
      parts.push(current)
      current = ''
      bytes = 0
    }
    current += ch
    bytes += size
  }
  parts.push(current)
  return parts.join('\r\n ')
}

const compactDate = (key: string) => key.replace(/-/g, '')

/** All-day events for every planned, unfinished item from today onwards. */
export function planICS(items: Item[], today: string, now = new Date()): string | null {
  const events = items.filter((i) => isPlannable(i) && !i.done && isDateSlot(i.slot) && i.slot >= today)
  if (!events.length) return null
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Composure//Plan//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]
  for (const item of events) {
    const slot = item.slot as string
    lines.push(
      'BEGIN:VEVENT',
      `UID:${item.id}@composure`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compactDate(slot)}`,
      `DTEND;VALUE=DATE:${compactDate(addDays(slot, 1))}`,
      `SUMMARY:${icsEscape(item.text)}`,
    )
    if (item.quadrant) lines.push(`CATEGORIES:${icsEscape(QUADRANT_BY_ID[item.quadrant].title)}`)
    lines.push('TRANSP:TRANSPARENT', 'END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

// ---------------------------------------------------------------- Things 3

/** things:/// JSON URL that adds every planned, unfinished item with its day. */
export function thingsURL(items: Item[], today: string): string | null {
  const todos = items
    .filter((i) => isPlannable(i) && !i.done && i.slot && !(isDateSlot(i.slot) && i.slot < today))
    .map((i) => ({
      type: 'to-do',
      attributes: {
        title: i.text,
        when: i.slot === LATER ? 'someday' : i.slot === today ? 'today' : i.slot,
        notes: i.quadrant ? `From Composure · ${QUADRANT_BY_ID[i.quadrant].title}` : 'From Composure',
      },
    }))
  if (!todos.length) return null
  return `things:///json?data=${encodeURIComponent(JSON.stringify(todos))}&reveal=true`
}

// ---------------------------------------------------------------- backup

export interface Backup {
  app: 'composure'
  version: 1
  exportedAt: string
  items: Item[]
}

export function makeBackup(items: Item[]): string {
  const backup: Backup = { app: 'composure', version: 1, exportedAt: new Date().toISOString(), items }
  return JSON.stringify(backup, null, 2)
}

const QUADRANT_IDS = new Set<string>(QUADRANTS.map((q) => q.id))

export function parseBackup(json: string): Item[] {
  const data = JSON.parse(json) as Partial<Backup>
  if (data?.app !== 'composure' || !Array.isArray(data.items)) throw new Error('Not a Composure backup')
  return data.items.map((raw, n) => {
    const r = raw as Partial<Item>
    if (typeof r.id !== 'string' || typeof r.text !== 'string') throw new Error(`Item ${n + 1} is malformed`)
    return {
      id: r.id,
      text: r.text,
      createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
      quadrant: r.quadrant && QUADRANT_IDS.has(r.quadrant) ? r.quadrant : null,
      slot: typeof r.slot === 'string' ? r.slot : null,
      done: Boolean(r.done),
    }
  })
}
