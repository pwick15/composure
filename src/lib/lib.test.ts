import { describe, expect, it } from 'vitest'
import { addDays, columnFor, LATER, planColumns, slotLabel } from './dates'
import { matrixMarkdown, parseBackup, planICS, planMarkdown, thingsURL } from './export'
import { fmt, stepMinutes } from './duration'
import { fuzzyBest, fuzzyMatch } from './fuzzy'
import {
  archiveDays,
  archivedIds,
  itemsInColumn,
  live,
  planGroups,
  planQueue,
  sortGroups,
  sortOrder,
  timeLeft,
  todayList,
  todayProgress,
} from './selectors'
import { splitLines } from './text'
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
})

describe('selectors', () => {
  it('walks unsorted first, then quadrants in grid order', () => {
    const items = [item('a', { quadrant: 'drop' }), item('b'), item('c', { quadrant: 'do' })]
    expect(sortOrder(items).map((i) => i.text)).toEqual(['b', 'c', 'a'])
  })

  it('groups Plan as queue, seven days, then Later', () => {
    const items = [item('q'), item('today', { slot: TODAY }), item('later', { slot: LATER })]
    const groups = planGroups(items, TODAY)
    expect(groups).toHaveLength(9)
    expect(groups.map((g) => g.map((i) => i.text).join())).toEqual(['q', 'today', '', '', '', '', '', '', 'later'])
  })

  it('queues overdue first, then by quadrant, and leaves out dropped and done', () => {
    const items = [
      item('unsorted'),
      item('schedule', { quadrant: 'schedule' }),
      item('do', { quadrant: 'do' }),
      item('overdue', { quadrant: 'delegate', slot: '2026-10-01' }),
      item('dropped', { quadrant: 'drop' }),
      item('done', { quadrant: 'do', done: true }),
      item('planned', { quadrant: 'do', slot: TODAY }),
    ]
    expect(planQueue(items, TODAY).map((i) => i.text)).toEqual(['overdue', 'do', 'schedule', 'unsorted'])
  })
})

describe('export', () => {
  const items = [
    item('Pay rent, today; really', { quadrant: 'do', slot: TODAY }),
    item('Plan trip', { quadrant: 'schedule', slot: '2026-10-14' }),
    item('Someday thing', { quadrant: 'schedule', slot: LATER }),
    item('Unplanned', { quadrant: 'do' }),
    item('Dropped', { quadrant: 'drop', slot: TODAY }),
  ]

  it('writes Markdown grouped by day', () => {
    const md = planMarkdown(items, TODAY)
    expect(md).toContain('## Today · Mon 12 Oct\n- [ ] Pay rent, today; really')
    expect(md).toContain('## Wed 14 Oct\n- [ ] Plan trip')
    expect(md).toContain('## Later\n- [ ] Someday thing')
    expect(md).toContain('## Not planned yet\n- [ ] Unplanned (Do)')
    expect(md).not.toContain('Dropped')
    expect(matrixMarkdown(items)).toContain('## Let go (Not urgent · Not important)\n- [ ] Dropped')
  })

  it('writes valid all-day iCalendar events with escaping', () => {
    const ics = planICS(items, TODAY, new Date('2026-10-12T09:30:00Z'))!
    expect(ics.split('\r\n').filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(2)
    expect(ics).toContain('DTSTART;VALUE=DATE:20261012\r\nDTEND;VALUE=DATE:20261013')
    expect(ics).toContain('SUMMARY:Pay rent\\, today\\; really')
    expect(ics).toContain('DTSTAMP:20261012T093000Z')
    expect(ics).not.toContain('Dropped')
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
})

describe('subtasks', () => {
  const trip = item('Plan trip', { quadrant: 'schedule' })
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

  it('Sort lists each quadrant quickest first, with unknown lengths last', () => {
    const items = [
      item('long', { quadrant: 'do', minutes: 90 }),
      item('unknown', { quadrant: 'do' }),
      item('quick', { quadrant: 'do', minutes: 5 }),
      item('other', { quadrant: 'schedule', minutes: 120 }),
      item('queue b', { minutes: 60 }),
      item('queue a', { minutes: 5 }),
    ]
    const [queue, doList, schedule] = sortGroups(items)
    expect(doList.map((i) => i.text)).toEqual(['quick', 'long', 'unknown'])
    expect(schedule.map((i) => i.text)).toEqual(['other'])
    // The unsorted queue stays in Dump order: it is a to-decide list, not a to-do list.
    expect(queue.map((i) => i.text)).toEqual(['queue b', 'queue a'])
  })

  it('a day lists the urgent quadrant first, then quickest to longest inside each', () => {
    const items = [
      item('schedule 10', { quadrant: 'schedule', slot: TODAY, minutes: 10 }),
      item('do 60', { quadrant: 'do', slot: TODAY, minutes: 60 }),
      item('do 15', { quadrant: 'do', slot: TODAY, minutes: 15 }),
      item('do ?', { quadrant: 'do', slot: TODAY }),
    ]
    expect(itemsInColumn(items, TODAY, TODAY).map((i) => i.text)).toEqual(['do 15', 'do 60', 'do ?', 'schedule 10'])
    expect(todayList(items, TODAY).map((i) => i.text)).toEqual(['do 15', 'do 60', 'do ?', 'schedule 10'])
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
