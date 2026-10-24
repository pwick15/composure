import { addDays, columnFor, isDateSlot, LATER, longDate, planColumns } from './dates'
import { cleanMinutes, fmt, sumMinutes } from './duration'
import { QUADRANTS, QUADRANT_BY_ID, upgradeQuadrant } from './quadrants'
import { doneDay, isPlannable, planQueue, todayList } from './selectors'
import { leaves, parentOf } from './tree'
import type { Item } from './types'

// Parents are labels for their subtasks, so every export lists the subtasks and names the parent.

/** " · Plan trip" for a subtask, else nothing. */
const partOf = (all: Item[], i: Item) => {
  const parent = parentOf(all, i)
  return parent ? ` · ${parent.text}` : ''
}

const estimate = (i: Item) => (i.minutes ? ` (${fmt(i.minutes)})` : '')

const boxer = (all: Item[]) => (i: Item) => `- [${i.done ? 'x' : ' '}] ${i.text}${estimate(i)}${partOf(all, i)}`

export function planMarkdown(all: Item[], today: string): string {
  const items = leaves(all)
  const box = boxer(all)
  const out = [`# Plan · ${longDate(today)}`]
  for (const col of planColumns(today)) {
    const list = items.filter((i) => isPlannable(i) && columnFor(i.slot, today) === col.key)
    if (!list.length) continue
    const heading =
      col.key === LATER ? 'Later' : col.label === col.sub.slice(0, 3) ? col.sub : `${col.label} · ${col.sub}`
    const total = sumMinutes(list)
    out.push('', `## ${heading}${total ? ` · ${fmt(total)}` : ''}`, ...list.map(box))
  }
  const rest = planQueue(all, today)
  if (rest.length) {
    out.push('', '## Not planned yet')
    out.push(...rest.map((i) => `${box(i)}${i.quadrant ? ` (${QUADRANT_BY_ID[i.quadrant].title})` : ''}`))
  }
  return out.join('\n') + '\n'
}

export function matrixMarkdown(all: Item[]): string {
  const items = leaves(all)
  const box = boxer(all)
  const out = ['# Lanes']
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
export function planICS(all: Item[], today: string, now = new Date()): string | null {
  const events = leaves(all).filter((i) => isPlannable(i) && !i.done && isDateSlot(i.slot) && i.slot >= today)
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
    const parent = parentOf(all, item)
    const notes = [parent && `Part of: ${parent.text}`, item.minutes && `Estimate: ${fmt(item.minutes)}`].filter(Boolean)
    if (notes.length) lines.push(`DESCRIPTION:${icsEscape(notes.join('\n'))}`)
    if (item.quadrant) lines.push(`CATEGORIES:${icsEscape(QUADRANT_BY_ID[item.quadrant].title)}`)
    lines.push('TRANSP:TRANSPARENT', 'END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

// ---------------------------------------------------------------- Things 3

/** things:/// JSON URL that adds every planned, unfinished item with its day. */
export function thingsURL(all: Item[], today: string): string | null {
  const todos = leaves(all)
    .filter((i) => isPlannable(i) && !i.done && i.slot && !(isDateSlot(i.slot) && i.slot < today))
    .map((i) => ({
      type: 'to-do',
      attributes: {
        title: i.text,
        when: i.slot === LATER ? 'someday' : i.slot === today ? 'today' : i.slot,
        notes: [
          'From Composure',
          i.quadrant && QUADRANT_BY_ID[i.quadrant].title,
          parentOf(all, i) && `Part of: ${parentOf(all, i)!.text}`,
          i.minutes && `Estimate: ${fmt(i.minutes)}`,
        ]
          .filter(Boolean)
          .join(' · '),
      },
    }))
  if (!todos.length) return null
  return `things:///json?data=${encodeURIComponent(JSON.stringify(todos))}&reveal=true`
}

/**
 * What sending a work session back to Things covers: what was ticked off today, then what is still
 * on today's plan, in session order. With a `session`, only that one.
 */
export function sessionTasks(all: Item[], today: string, session?: number): Item[] {
  const finished = leaves(all)
    .filter((i) => i.done && isPlannable(i) && doneDay(i) === today && isDateSlot(i.slot) && i.slot <= today)
    .sort((a, b) => (a.doneAt ?? 0) - (b.doneAt ?? 0))
  return [...finished, ...todayList(all, today)]
    .filter((i) => session === undefined || i.session === session)
    .sort((a, b) => a.session - b.session)
}

/** Plain `- [x]` / `- [ ]` lines: the fallback when the Things link fails. */
export const sessionMarkdown = (tasks: Item[]): string => tasks.map((i) => `- [${i.done ? 'x' : ' '}] ${i.text}`).join('\n') + '\n'

// A link carries every task in it, and Things takes 250 to-dos per 10 seconds, so long lists are cut
// into several links of at most this many tasks and this many characters.
const LINK_TASKS = 100
const LINK_CHARS = 12_000

/**
 * things:///json links that add the tasks: ticked ones already completed (so they land in the
 * Logbook, dated when they were done), the rest open in the Inbox. One link, or several for a long list.
 */
export function thingsSessionLinks(all: Item[], tasks: Item[]): string[] {
  const todo = (i: Item) => {
    const parent = parentOf(all, i)
    return {
      type: 'to-do',
      attributes: {
        title: i.text,
        notes: parent ? `From Composure · Part of: ${parent.text}` : 'From Composure',
        ...(i.done ? { completed: true, 'completion-date': new Date(i.doneAt ?? Date.now()).toISOString() } : {}),
      },
    }
  }
  const link = (todos: unknown[]) => `things:///json?data=${encodeURIComponent(JSON.stringify(todos))}&reveal=true`
  const links: string[] = []
  let batch: unknown[] = []
  for (const task of tasks) {
    const next = [...batch, todo(task)]
    if (batch.length && (next.length > LINK_TASKS || link(next).length > LINK_CHARS)) {
      links.push(link(batch))
      batch = [todo(task)]
    } else {
      batch = next
    }
  }
  if (batch.length) links.push(link(batch))
  return links
}

// ---------------------------------------------------------------- backup

/** Day → session number → name. */
export type SessionNames = Record<string, Record<number, string>>

export interface Backup {
  app: 'composure'
  version: 1
  exportedAt: string
  items: Item[]
  /** What you called your work sessions. Older backups don't have it. */
  sessionNames?: SessionNames
}

export function makeBackup(items: Item[], sessionNames: SessionNames = {}): string {
  const backup: Backup = { app: 'composure', version: 1, exportedAt: new Date().toISOString(), items }
  if (Object.keys(sessionNames).length) backup.sessionNames = sessionNames
  return JSON.stringify(backup, null, 2)
}

/** The session names in a backup, keeping only well-formed ones (a day key, a session number, some text). */
export function parseSessionNames(json: string): SessionNames {
  const raw = (JSON.parse(json) as Partial<Backup>)?.sessionNames
  const out: SessionNames = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [day, names] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !names || typeof names !== 'object') continue
    for (const [n, name] of Object.entries(names)) {
      if (/^[1-9]\d*$/.test(n) && typeof name === 'string' && name.trim()) (out[day] ??= {})[Number(n)] = name.trim()
    }
  }
  return out
}

/** Adds a backup's session names without renaming any session you've already named. */
export function mergeSessionNames(existing: SessionNames, incoming: SessionNames): SessionNames {
  const out: SessionNames = { ...existing }
  for (const [day, names] of Object.entries(incoming)) out[day] = { ...names, ...existing[day] }
  return out
}

/** The places you gave a thought by hand, keeping only valid ones (as `{ manual }`, or nothing). */
function cleanManual(raw: unknown): Pick<Item, 'manual'> {
  const manual: NonNullable<Item['manual']> = {}
  for (const v of ['sort', 'plan', 'today'] as const) {
    const n = (raw as Item['manual'] | undefined)?.[v]
    if (typeof n === 'number' && Number.isInteger(n) && n >= 1) manual[v] = n
  }
  return Object.keys(manual).length ? { manual } : {}
}

export function parseBackup(json: string): Item[] {
  const data = JSON.parse(json) as Partial<Backup>
  if (data?.app !== 'composure' || !Array.isArray(data.items)) throw new Error('Not a Composure backup')
  const ids = new Set(data.items.map((r) => (r as Partial<Item>)?.id))
  const items = data.items.map((raw, n) => {
    const r = raw as Partial<Item>
    if (typeof r.id !== 'string' || typeof r.text !== 'string') throw new Error(`Item ${n + 1} is malformed`)
    return {
      id: r.id,
      text: r.text,
      createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
      quadrant: upgradeQuadrant(r.quadrant),
      slot: typeof r.slot === 'string' ? r.slot : null,
      done: Boolean(r.done),
      doneAt: r.done && typeof r.doneAt === 'number' ? r.doneAt : null,
      minutes: cleanMinutes(r.minutes),
      session: typeof r.session === 'number' && Number.isInteger(r.session) && r.session >= 1 ? r.session : 1,
      parentId: typeof r.parentId === 'string' && r.parentId !== r.id && ids.has(r.parentId) ? r.parentId : null,
      ...cleanManual(r.manual),
      ...(typeof r.main === 'string' ? { main: r.main } : {}),
    }
  })
  // Subtasks are one level deep: a subtask of a subtask becomes a plain thought.
  const nested = new Set(items.filter((i) => i.parentId).map((i) => i.id))
  return items.map((i) => (i.parentId && nested.has(i.parentId) ? { ...i, parentId: null } : i))
}

/** Adds what a file holds to what's already here. A thought that is already here (same id) stays as it is. */
export function mergeItems(existing: Item[], incoming: Item[]): { items: Item[]; added: number; skipped: number } {
  const have = new Set(existing.map((i) => i.id))
  const fresh = incoming.filter((i) => !have.has(i.id))
  return { items: [...existing, ...fresh], added: fresh.length, skipped: incoming.length - fresh.length }
}
