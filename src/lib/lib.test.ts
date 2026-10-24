import { describe, expect, it } from 'vitest'
import { addDays, columnFor, LATER, planColumns, slotLabel } from './dates'
import { matrixMarkdown, parseBackup, planICS, planMarkdown, sessionMarkdown, sessionTasks, thingsSessionLinks, thingsURL } from './export'
import { fmt, stepMinutes } from './duration'
import { fuzzyBest, fuzzyMatch } from './fuzzy'
import { parsePause } from './interrupt'
import { endPause, pauseLeftMs, taskClock, type Run } from './session'
import { buildSections } from './palette'
import {
  archiveDays,
  archivedIds,
  gapsOf,
  itemsInColumn,
  live,
  mainThing,
  planGroups,
  planQueue,
  quickLane,
  resolveSortCursor,
  sortGroups,
  sortOrder,
  timeLeft,
  todayList,
  todayProgress,
} from './selectors'
import { parseNotes, splitLines } from './text'
import { isDone, leaves, progress, treeOrder } from './tree'
import type { Item } from './types'

const TODAY = '2026-10-12' // a Monday

let n = 0
const item = (text: string, extra: Partial<Item> = {}): Item => ({
  id: `i${++n}`,
  text,
  createdAt: 0,
  quadrant: null,
  slot: null,
  done: false,
  doneAt: null,
  parentId: null,
  minutes: null,
  session: 1,
  ...extra,
})

describe('fuzzyMatch', () => {
  it('ranks a prefix above a mid-word substring above a scattered match', () => {
    const prefix = fuzzyMatch('sort', 'Sort mode')!.score
    const mid = fuzzyMatch('sort', 'Resort booking')!.score
    const scattered = fuzzyMatch('sort', 'Send our report today')!.score
    expect(prefix).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(scattered)
  })

  it('returns highlight indices and null on a miss', () => {
    expect(fuzzyMatch('cal', 'Download calendar')!.indices).toEqual([9, 10, 11])
    expect(fuzzyMatch('xyz', 'Download calendar')).toBeNull()
  })

  it('prefers word starts for scattered matches', () => {
    expect(fuzzyMatch('dc', 'Download calendar')!.indices).toEqual([0, 9])
  })

  it('matches keywords without highlighting the label', () => {
    const m = fuzzyBest('eisenhower', 'Sort mode', 'eisenhower matrix')
    expect(m).not.toBeNull()
    expect(m!.indices).toEqual([])
  })
})

describe('dates', () => {
  it('builds a 7-day window plus Later', () => {
    const cols = planColumns(TODAY)
    expect(cols.map((c) => c.label)).toEqual(['Today', 'Tomorrow', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Later'])
    expect(cols.filter((c) => c.weekend).map((c) => c.label)).toEqual(['Sat', 'Sun'])
  })

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('maps slots to columns', () => {
    expect(columnFor(null, TODAY)).toBeNull()
    expect(columnFor('2026-10-11', TODAY)).toBeNull() // overdue goes back to the queue
    expect(columnFor('2026-10-14', TODAY)).toBe('2026-10-14')
    expect(columnFor('2026-10-30', TODAY)).toBe(LATER) // beyond the window
    expect(columnFor(LATER, TODAY)).toBe(LATER)
    expect(slotLabel('2026-10-10', TODAY)).toBe('Overdue · Sat 10 Oct')
  })
})

describe('splitLines', () => {
  it('strips bullets, numbers and checkboxes', () => {
    expect(splitLines('- milk\n* eggs\n1. call mum\n- [ ] taxes\n[x] done thing\n\n  •  rent  ')).toEqual([
      'milk',
      'eggs',
      'call mum',
      'taxes',
      'done thing',
      'rent',
    ])
  })

  it('drops the day/month/year Things puts in front of a copied task', () => {
    expect(
      splitLines('- [ ] 24/10/2026 Update my MacBook OS\n- [ ] 24/10/2026 TODAY TASKS MATE `\n- [ ] 4/1/2027 Admin\n- [x] 01/02/2026 Done one'),
    ).toEqual(['Update my MacBook OS', 'TODAY TASKS MATE `', 'Admin', 'Done one'])
    expect(parseNotes('- [x] 24/10/2026 Book dentist\n- [ ] 24/10/2026 Pay rent')).toEqual([
      { text: 'Book dentist', done: true },
      { text: 'Pay rent', done: false },
    ])
  })

  it('only strips a date at the start, and only a real one followed by a title', () => {
    expect(splitLines('Call mum on 24/10/2026 about it')).toEqual(['Call mum on 24/10/2026 about it'])
    expect(splitLines('- 24/10/2026')).toEqual(['24/10/2026'])
    expect(splitLines('32/10/2026 not a day\n24/13/2026 not a month\n24/10/26 two-digit year\n1/2 half')).toEqual([
      '32/10/2026 not a day',
      '24/13/2026 not a month',
      '24/10/26 two-digit year',
      '1/2 half',
    ])
  })
})

describe('selectors', () => {
  it('walks unsorted first, then the lanes left to right', () => {
    const items = [item('a', { quadrant: 'quick' }), item('b'), item('c', { quadrant: 'do' })]
    expect(sortOrder(items).map((i) => i.text)).toEqual(['b', 'c', 'a'])
  })

  it('groups Plan as queue, seven days, then Later', () => {
    const items = [item('q'), item('today', { slot: TODAY }), item('later', { slot: LATER })]
    const groups = planGroups(items, TODAY)
    expect(groups).toHaveLength(9)
    expect(groups.map((g) => g.map((i) => i.text).join())).toEqual(['q', 'today', '', '', '', '', '', '', 'later'])
  })

  it('queues overdue first, then by lane, and leaves out 2-minute and done', () => {
    const items = [
      item('unsorted'),
      item('admin', { quadrant: 'admin' }),
      item('do', { quadrant: 'do' }),
      item('overdue', { quadrant: 'admin', slot: '2026-10-01' }),
      item('quick', { quadrant: 'quick' }),
      item('done', { quadrant: 'do', done: true }),
      item('planned', { quadrant: 'do', slot: TODAY }),
    ]
    expect(planQueue(items, TODAY).map((i) => i.text)).toEqual(['overdue', 'do', 'admin', 'unsorted'])
  })

  it('a 2-minute thought needs no day or time, and stays out of Today', () => {
    const quick = item('reply to Sam', { quadrant: 'quick', slot: TODAY })
    expect(gapsOf(quick)).toEqual([])
    expect(todayList([quick], TODAY)).toEqual([])
  })

  it('once nothing is left to sort, Sort lands on the first 2-minute task', () => {
    const items = [item('a', { quadrant: 'do' }), item('b', { quadrant: 'quick', minutes: 5 }), item('c', { quadrant: 'quick' })]
    expect(quickLane(items).map((i) => i.text)).toEqual(['b', 'c'])
    expect(resolveSortCursor(items, null)).toBe(items[1].id)
    expect(resolveSortCursor([...items, item('new')], null)).not.toBe(items[1].id)
  })

  it("puts today's main thing first in its session, and forgets it once it moves to another day", () => {
    const items = [
      item('quick win', { quadrant: 'do', slot: TODAY, minutes: 5 }),
      item('hard thing', { quadrant: 'do', slot: TODAY, minutes: 120, main: TODAY }),
    ]
    expect(todayList(items, TODAY).map((i) => i.text)).toEqual(['hard thing', 'quick win'])
    expect(mainThing(items, TODAY)?.text).toBe('hard thing')
    const moved = items.map((i) => ({ ...i, slot: addDays(TODAY, 1) }))
    expect(mainThing(moved, TODAY)).toBeNull()
    const done = items.map((i) => ({ ...i, done: true, doneAt: new Date(`${TODAY}T12:00:00`).getTime() }))
    expect(mainThing(done, TODAY)?.text).toBe('hard thing')
  })
})

describe('export', () => {
  const items = [
    item('Pay rent, today; really', { quadrant: 'do', slot: TODAY }),
    item('Plan trip', { quadrant: 'do', slot: '2026-10-14' }),
    item('Someday thing', { quadrant: 'admin', slot: LATER }),
    item('Unplanned', { quadrant: 'do' }),
    item('Reply to Sam', { quadrant: 'quick', slot: TODAY }),
  ]

  it('writes Markdown grouped by day', () => {
    const md = planMarkdown(items, TODAY)
    expect(md).toContain('## Today · Mon 12 Oct\n- [ ] Pay rent, today; really')
    expect(md).toContain('## Wed 14 Oct\n- [ ] Plan trip')
    expect(md).toContain('## Later\n- [ ] Someday thing')
    expect(md).toContain('## Not planned yet\n- [ ] Unplanned (Do)')
    expect(md).not.toContain('Reply to Sam')
    expect(matrixMarkdown(items)).toContain('## 2-minute (Under 2 minutes)\n- [ ] Reply to Sam')
  })

  it('writes valid all-day iCalendar events with escaping', () => {
    const ics = planICS(items, TODAY, new Date('2026-10-12T09:30:00Z'))!
    expect(ics.split('\r\n').filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(2)
    expect(ics).toContain('DTSTART;VALUE=DATE:20261012\r\nDTEND;VALUE=DATE:20261013')
    expect(ics).toContain('SUMMARY:Pay rent\\, today\\; really')
    expect(ics).toContain('DTSTAMP:20261012T093000Z')
    expect(ics).not.toContain('Reply to Sam')
  })

  it('folds long iCalendar lines at 75 octets', () => {
    const long = [item('x'.repeat(200), { slot: TODAY })]
    const lines = planICS(long, TODAY)!.split('\r\n')
    expect(lines.every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true)
    expect(lines.some((l) => l.startsWith(' x'))).toBe(true)
  })

  it('builds a Things URL with the right "when" values', () => {
    const url = thingsURL(items, TODAY)!
    const data = JSON.parse(decodeURIComponent(url.split('data=')[1].split('&')[0]))
    expect(data.map((t: { attributes: { when: string } }) => t.attributes.when)).toEqual([
      'today',
      '2026-10-14',
      'someday',
    ])
  })

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('{"hello":1}')).toThrow('Not a Composure backup')
    const ok = parseBackup(JSON.stringify({ app: 'composure', version: 1, items: [{ id: 'a', text: 'x', quadrant: 'nope' }] }))
    expect(ok[0]).toMatchObject({ id: 'a', text: 'x', quadrant: null, slot: null, done: false })
  })

  it('reads old backups filed in the Eisenhower quadrants into the lanes', () => {
    const old = ['do', 'schedule', 'delegate', 'drop', 'admin', 'quick'].map((quadrant, n) => ({ id: `${n}`, text: quadrant, quadrant }))
    const items = parseBackup(JSON.stringify({ app: 'composure', version: 1, items: old }))
    expect(items.map((i) => i.quadrant)).toEqual(['do', 'do', 'admin', null, 'admin', 'quick'])
  })
})

describe('sending a session to Things', () => {
  const noon = new Date(`${TODAY}T12:00:00`).getTime()
  const open1 = item('Open one', { slot: TODAY })
  const done1 = item('Done one', { slot: TODAY, done: true, doneAt: noon })
  const open2 = item('Second session task', { slot: TODAY, session: 2 })
  const done2 = item('Done in two', { slot: TODAY, session: 2, done: true, doneAt: noon + 1000 })
  const oldDone = item('Done yesterday', { slot: TODAY, done: true, doneAt: noon - 86_400_000 })
  const later = item('Next week', { slot: '2026-10-19' })
  const all = [open1, done1, open2, done2, oldDone, later]
  const decode = (url: string) => JSON.parse(decodeURIComponent(url.split('data=')[1].split('&')[0]))

  it('covers what was done today and what is left, session by session', () => {
    expect(sessionTasks(all, TODAY).map((i) => i.text)).toEqual(['Done one', 'Open one', 'Done in two', 'Second session task'])
    expect(sessionTasks(all, TODAY, 2).map((i) => i.text)).toEqual(['Done in two', 'Second session task'])
  })

  it('sends finished tasks completed and dated, and leftovers open, with a short note', () => {
    const [url] = thingsSessionLinks(all, sessionTasks(all, TODAY, 1))
    expect(url.startsWith('things:///json?data=')).toBe(true)
    expect(decode(url)).toEqual([
      { type: 'to-do', attributes: { title: 'Done one', notes: 'From Composure', completed: true, 'completion-date': new Date(noon).toISOString() } },
      { type: 'to-do', attributes: { title: 'Open one', notes: 'From Composure' } },
    ])
  })

  it('names the parent of a subtask in the note, and leaves out lane, day and estimate', () => {
    const parent = item('Plan trip', { quadrant: 'admin', slot: TODAY })
    const sub = item('Book flights', { parentId: parent.id, quadrant: 'do', slot: TODAY, minutes: 30 })
    const [url] = thingsSessionLinks([parent, sub], [sub])
    expect(decode(url)).toEqual([{ type: 'to-do', attributes: { title: 'Book flights', notes: 'From Composure · Part of: Plan trip' } }])
  })

  it('splits a long list over several links without losing a task', () => {
    const many = Array.from({ length: 230 }, (_, k) => item(`Task number ${k}`, { slot: TODAY }))
    const links = thingsSessionLinks(many, sessionTasks(many, TODAY))
    expect(links.length).toBeGreaterThan(1)
    expect(links.every((l) => l.length <= 12_000 && decode(l).length <= 100)).toBe(true)
    expect(links.flatMap(decode).map((t: { attributes: { title: string } }) => t.attributes.title)).toEqual(many.map((i) => i.text))
  })

  it('writes the same tasks as Markdown checkboxes', () => {
    expect(sessionMarkdown(sessionTasks(all, TODAY, 1))).toBe('- [x] Done one\n- [ ] Open one\n')
  })
})

describe('subtasks', () => {
  const trip = item('Plan trip', { quadrant: 'admin' })
  const flights = item('book flights', { parentId: trip.id, quadrant: 'do', slot: TODAY })
  const rent = item('Pay rent')
  const hotel = item('book hotel', { parentId: trip.id })
  // Stored order is not Dump order: subtasks can sit anywhere after their parent.
  const all = [trip, rent, flights, hotel]

  it('treeOrder puts subtasks under their parent; leaves skips the parent', () => {
    expect(treeOrder(all).map((i) => i.text)).toEqual(['Plan trip', 'book flights', 'book hotel', 'Pay rent'])
    expect(leaves(all).map((i) => i.text)).toEqual(['Pay rent', 'book flights', 'book hotel'])
  })

  it('an orphan whose parent is gone is shown and used as a normal thought', () => {
    const lost = item('lost', { parentId: 'gone' })
    expect(treeOrder([lost]).map((i) => i.text)).toEqual(['lost'])
    expect(leaves([lost])).toHaveLength(1)
  })

  it('Sort and Plan only see the subtasks', () => {
    expect(sortOrder(all).map((i) => i.text)).toEqual(['Pay rent', 'book hotel', 'book flights'])
    expect(planQueue(all, TODAY).map((i) => i.text)).toEqual(['Pay rent', 'book hotel'])
  })

  it('a parent is done when all its subtasks are', () => {
    expect(isDone(all, trip)).toBe(false)
    const ticked = all.map((i) => (i.parentId ? { ...i, done: true } : i))
    expect(isDone(ticked, ticked[0])).toBe(true)
    expect(progress(ticked, trip.id)).toEqual({ done: 2, total: 2 })
    expect(progress(all, rent.id)).toBeNull()
  })

  it('exports list the subtasks and name the parent', () => {
    expect(matrixMarkdown(all)).toContain('- [ ] book flights · Plan trip')
    expect(matrixMarkdown(all)).not.toContain('- [ ] Plan trip')
    expect(planMarkdown(all, TODAY)).toContain('- [ ] book flights · Plan trip')
    expect(planICS(all, TODAY)).toContain('DESCRIPTION:Part of: Plan trip')
    expect(decodeURIComponent(thingsURL(all, TODAY)!)).toContain('Part of: Plan trip')
  })

  it('backups keep subtasks, and drop links that point nowhere or nest too deep', () => {
    const json = JSON.stringify({
      app: 'composure',
      version: 2,
      items: [
        { id: 'p', text: 'p' },
        { id: 'c', text: 'c', parentId: 'p' },
        { id: 'g', text: 'g', parentId: 'c' },
        { id: 'x', text: 'x', parentId: 'missing' },
        { id: 'self', text: 'self', parentId: 'self' },
      ],
    })
    expect(parseBackup(json).map((i) => i.parentId)).toEqual([null, 'p', null, null, null])
  })
})

describe('time estimates', () => {
  it('formats minutes the way you would say them', () => {
    expect([5, 45, 60, 90, 125, 240].map(fmt)).toEqual(['5m', '45m', '1h', '1h 30m', '2h 5m', '4h'])
  })

  it('steps through the ladder; below the shortest clears, above the longest stays', () => {
    expect(stepMinutes(null, 1)).toBe(15)
    expect(stepMinutes(null, -1)).toBe(5)
    expect(stepMinutes(30, 1)).toBe(45)
    expect(stepMinutes(30, -1)).toBe(25)
    expect(stepMinutes(5, -1)).toBeNull()
    expect(stepMinutes(240, 1)).toBe(240)
    expect(stepMinutes(40, 1)).toBe(45) // off the ladder: snaps to the next rung
  })

  it('Sort lists each lane quickest first, with unknown lengths last', () => {
    const items = [
      item('long', { quadrant: 'do', minutes: 90 }),
      item('unknown', { quadrant: 'do' }),
      item('quick', { quadrant: 'do', minutes: 5 }),
      item('other', { quadrant: 'admin', minutes: 120 }),
      item('queue b', { minutes: 60 }),
      item('queue a', { minutes: 5 }),
    ]
    const [queue, doList, admin] = sortGroups(items)
    expect(doList.map((i) => i.text)).toEqual(['quick', 'long', 'unknown'])
    expect(admin.map((i) => i.text)).toEqual(['other'])
    // The unsorted queue stays in Dump order: it is a to-decide list, not a to-do list.
    expect(queue.map((i) => i.text)).toEqual(['queue b', 'queue a'])
  })

  it('a day lists Do before Admin, then quickest to longest inside each', () => {
    const items = [
      item('admin 10', { quadrant: 'admin', slot: TODAY, minutes: 10 }),
      item('do 60', { quadrant: 'do', slot: TODAY, minutes: 60 }),
      item('do 15', { quadrant: 'do', slot: TODAY, minutes: 15 }),
      item('do ?', { quadrant: 'do', slot: TODAY }),
    ]
    expect(itemsInColumn(items, TODAY, TODAY).map((i) => i.text)).toEqual(['do 15', 'do 60', 'do ?', 'admin 10'])
    expect(todayList(items, TODAY).map((i) => i.text)).toEqual(['do 15', 'do 60', 'do ?', 'admin 10'])
  })

  it('totals the time left today; a task with no estimate counts as a default-length one', () => {
    const items = [
      item('a', { quadrant: 'do', slot: TODAY, minutes: 30, done: true }),
      item('b', { quadrant: 'do', slot: TODAY, minutes: 45 }),
      item('c', { quadrant: 'do', slot: TODAY }),
      item('tomorrow', { quadrant: 'do', slot: addDays(TODAY, 1), minutes: 600 }),
    ]
    expect(timeLeft(items, TODAY)).toEqual({ minutes: 70, unestimated: 1, open: 2 })
  })

  it('exports carry the estimate and the day total', () => {
    const items = [
      item('call dentist', { quadrant: 'do', slot: TODAY, minutes: 10 }),
      item('write report', { quadrant: 'do', slot: TODAY, minutes: 90 }),
    ]
    const md = planMarkdown(items, TODAY)
    expect(md).toContain('· 1h 40m')
    expect(md).toContain('- [ ] call dentist (10m)')
    expect(planICS(items, TODAY)).toContain('DESCRIPTION:Estimate: 10m')
  })

  it('backups keep sensible estimates and drop the rest', () => {
    const json = JSON.stringify({
      app: 'composure',
      version: 3,
      items: [
        { id: 'a', text: 'a', minutes: 30 },
        { id: 'b', text: 'b', minutes: -5 },
        { id: 'c', text: 'c', minutes: 'soon' },
        { id: 'd', text: 'd', minutes: 99999 },
        { id: 'e', text: 'e' },
      ],
    })
    expect(parseBackup(json).map((i) => i.minutes)).toEqual([30, null, null, null, null])
  })
})

describe('archive', () => {
  const at = (day: string, hour = 10) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`).getTime()
  const YESTERDAY = '2026-10-11'

  it('files a thought the moment it is done, whatever day it was ticked off', () => {
    const items = [
      item('done today', { slot: TODAY, done: true, doneAt: at(TODAY) }),
      item('done yesterday', { slot: YESTERDAY, done: true, doneAt: at(YESTERDAY) }),
      item('open', { slot: TODAY }),
    ]
    expect([...archivedIds(items)]).toEqual([items[0].id, items[1].id])
    expect(live(items).map((i) => i.text)).toEqual(['open'])
    expect(todayList(items, TODAY).map((i) => i.text)).toEqual(['open'])
  })

  it('a done thought nobody dated is archived too', () => {
    expect(archivedIds([item('imported', { done: true })]).size).toBe(1)
  })

  it('a done subtask leaves at once; the parent follows with the last one', () => {
    const parent = item('trip')
    const a = item('flights', { parentId: parent.id, done: true, doneAt: at(TODAY) })
    const b = item('hotel', { parentId: parent.id })
    expect([...archivedIds([parent, a, b])]).toEqual([a.id])
    expect(live([parent, a, b]).map((i) => i.text)).toEqual(['trip', 'hotel'])
    const both = [parent, a, { ...b, done: true, doneAt: at(TODAY) }]
    expect(archivedIds(both).size).toBe(3)
    expect(live(both)).toHaveLength(0)
  })

  it('Sort and Plan leave archived thoughts out', () => {
    const old = item('old', { quadrant: 'do', slot: TODAY, done: true, doneAt: at(YESTERDAY) })
    expect(sortGroups([old]).flat()).toHaveLength(0)
    expect(itemsInColumn([old], TODAY, TODAY)).toHaveLength(0)
  })

  it("today's progress counts what was ticked off today, archived or not", () => {
    const items = [
      item('done', { slot: TODAY, done: true, doneAt: at(TODAY) }),
      item('late and done', { slot: YESTERDAY, done: true, doneAt: at(TODAY) }),
      item('open', { slot: TODAY }),
      item('done yesterday', { slot: YESTERDAY, done: true, doneAt: at(YESTERDAY) }),
      item('done early', { slot: '2026-10-20', done: true, doneAt: at(TODAY) }),
      item('unplanned', { done: true, doneAt: at(TODAY) }),
    ]
    expect(todayProgress(items, TODAY)).toEqual({ done: 2, total: 3 })
  })

  it('lists the archive by day, latest first', () => {
    const items = [
      item('old', { done: true, doneAt: at('2026-10-09') }),
      item('late', { done: true, doneAt: at(YESTERDAY, 17) }),
      item('early', { done: true, doneAt: at(YESTERDAY, 8) }),
    ]
    const days = archiveDays(items)
    expect(days.map((d) => d.day)).toEqual([YESTERDAY, '2026-10-09'])
    expect(days[0].items.map((i) => i.text)).toEqual(['late', 'early'])
  })

  it('backups keep the day it was done', () => {
    const json = JSON.stringify({
      app: 'composure',
      version: 1,
      items: [
        { id: 'a', text: 'a', done: true, doneAt: 123 },
        { id: 'b', text: 'b', done: false, doneAt: 123 },
      ],
    })
    expect(parseBackup(json).map((i) => i.doneAt)).toEqual([123, null])
  })
})

describe('search', () => {
  const mk = (id: string, text: string, done = false): Item => ({ id, text, createdAt: 0, quadrant: null, slot: null, done, doneAt: done ? 1 : null, parentId: null, minutes: null, session: 1 })

  it('lists finished thoughts in their own Archive section, after the open ones', () => {
    const sections = buildSections('report', 'dump', [mk('a', 'write report'), mk('b', 'file report', true)])
    const titles = sections.map((s) => s.title)
    expect(titles.indexOf('Archive')).toBeGreaterThan(titles.indexOf('Thoughts'))
    const rows = (t: string) => sections.find((s) => s.title === t)!.rows.map((r) => (r.kind === 'item' ? r.item.text : ''))
    expect(rows('Thoughts')).toEqual(['write report'])
    expect(rows('Archive')).toEqual(['file report'])
  })

  it('has no Archive section when nothing finished matches', () => {
    const titles = buildSections('report', 'dump', [mk('a', 'write report'), mk('b', 'call mum', true)]).map((s) => s.title)
    expect(titles).not.toContain('Archive')
  })

  it('a finished match never pushes the "add as a thought" row below the real results', () => {
    const sections = buildSections('zzzz', 'dump', [mk('b', 'zzzz old', true)])
    expect(sections[0].title).toBe('New')
  })
})

describe('interruptions', () => {
  it('reads what came up and how long it takes', () => {
    expect(parsePause('call mum 15m')).toEqual({ label: 'Call mum', minutes: 15 })
    expect(parsePause('hang laundry 15')).toEqual({ label: 'Hang laundry', minutes: 15 })
    expect(parsePause('lunch 1h')).toEqual({ label: 'Lunch', minutes: 60 })
    expect(parsePause('lunch 1.5 hours')).toEqual({ label: 'Lunch', minutes: 90 })
    expect(parsePause('call')).toEqual({ label: 'Call', minutes: null }) // lasts until you're back
    expect(parsePause('10 min')).toEqual({ label: 'Break', minutes: 10 })
    expect(parsePause('  ')).toEqual({ label: 'Break', minutes: null })
  })

  it('holds the task clock while away and slides its window by the time spent', () => {
    const run: Run = { session: 1, queue: ['a'], index: 0, startedAt: 1_000, phase: 'running' }
    const away = { ...run, pause: { label: 'Call', startedAt: 5_000, minutes: null } }
    expect(taskClock(run, 9_000)).toBe(9_000)
    expect(taskClock(away, 9_000)).toBe(5_000)
    expect(endPause(away, 65_000)).toEqual({ ...run, startedAt: 61_000 })
    expect(pauseLeftMs({ label: 'B', startedAt: 0, minutes: 5 }, 60_000)).toBe(240_000)
    expect(pauseLeftMs({ label: 'B', startedAt: 0, minutes: 5 }, 400_000)).toBe(0)
    expect(pauseLeftMs({ label: 'B', startedAt: 0, minutes: null }, 400_000)).toBe(0)
  })
})
