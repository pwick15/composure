import type { ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { addDays, todayKey } from '../lib/dates'
import type { Item } from '../lib/types'
import { getState, setState, useStore } from '../state/store'
import { buildSections } from '../lib/palette'
import { FocusPill } from '../components/FocusPill'
import { Help } from '../components/Help'
import { ThoughtSheet } from '../components/ThoughtSheet'
import { ArchiveMode } from './ArchiveMode'
import { DumpMode } from './DumpMode'
import { PlanMode } from './PlanMode'
import { SortMode } from './SortMode'
import { TodayMode } from './TodayMode'

// renderToString reads zustand's *initial* snapshot, not the live state, so each test
// writes its items into that snapshot object (and the store) before rendering.
const snapshot = useStore.getInitialState()
const pristine = { ...snapshot }
const load = (items: Item[]) => {
  Object.assign(snapshot, pristine, { items })
  setState(snapshot, true)
}
beforeEach(() => load([]))

/** Server rendering splits adjacent text nodes with comment markers; drop them to match on text. */
const render = (view: ReactElement) => renderToString(view).replaceAll('<!-- -->', '')

const base: Item = { id: '', text: '', createdAt: 0, quadrant: null, slot: null, done: false, doneAt: null, parentId: null, minutes: null, session: 1 }
const today = todayKey()

/** A parent with two subtasks that are filed and planned, and a plain thought. */
function seed() {
  load([
      { ...base, id: 'p', text: 'Plan trip', quadrant: 'admin', slot: today },
      { ...base, id: 'f', text: 'book flights', parentId: 'p', quadrant: 'do', slot: today, minutes: 30 },
      { ...base, id: 'h', text: 'book hotel', parentId: 'p', quadrant: 'do', slot: today, minutes: 90, done: true },
      { ...base, id: 'r', text: 'pay rent', quadrant: 'do', slot: today },
  ])
}

describe('screens', () => {
  it('Dump shows subtasks as a tree with progress and the parent total', () => {
    seed()
    // Give the open subtask no day, so it still needs sorting out (planned ones step aside).
    load(getState().items.map((i) => (i.id === 'f' ? { ...i, slot: null } : i)))
    const html = render(<DumpMode />)
    expect(html).toContain('└') // the open subtask; the finished one is in the archive
    expect(html).not.toContain('book hotel')
    expect(html).toContain('1/2')
    expect(html).toContain('~30m') // what's left of the parent
  })

  it('Dump tucks away what is sorted and planned, and says how many', () => {
    seed() // "book flights" has a lane, a day and a time; "pay rent" has no time
    const html = render(<DumpMode />)
    expect(html).toContain('pay rent')
    expect(html).not.toContain('book flights')
    expect(html).not.toContain('Plan trip')
    expect(html).toContain('show 1 sorted and planned')
  })

  it('Dump says so when everything is sorted and planned', () => {
    load([{ ...base, id: 'a', text: 'call mum', quadrant: 'do', slot: today, minutes: 15 }])
    const html = render(<DumpMode />)
    expect(html).toContain('All clear.')
    expect(html).not.toContain('call mum')
    setState({ showPlanned: true })
    Object.assign(snapshot, { showPlanned: true })
    expect(render(<DumpMode />)).toContain('call mum')
  })

  it('the thought sheet shows a row per field, a numbered option for each choice, and the text to edit', () => {
    load([{ ...base, id: 'a', text: 'call mum' }])
    const sheet = { ids: ['a'], purpose: 'fill' as const, row: 'quadrant' as const, col: 1, query: null, receipt: null, nonce: 1 }
    Object.assign(snapshot, { sheet })
    setState({ sheet })
    const html = render(<ThoughtSheet />)
    for (const label of ['text', 'lane', 'day', 'time']) expect(html).toContain(`>${label}</button>`)
    expect(html).toContain('call mum') // in the text box
    expect(html.match(/class="attr"/g)).toHaveLength(3 + 8 + 6) // lanes, days, times
    expect(html.match(/data-cursor="true"/g)).toHaveLength(1)
    expect(html).not.toContain('>session</button>') // no day yet, so no sessions to offer
  })

  it('a finished thought opens with only its text', () => {
    seed()
    const sheet = { ids: ['h'], purpose: 'edit' as const, row: 'text' as const, col: 0, query: null, receipt: null, nonce: 2 }
    Object.assign(snapshot, { sheet })
    setState({ sheet })
    const html = render(<ThoughtSheet />)
    expect(html).toContain('book hotel')
    expect(html).not.toContain('>lane</button>')
  })

  it('Sort puts the subtasks in quadrants, not the parent, each pointing back at it', () => {
    seed()
    const html = render(<SortMode />)
    expect(html).toContain('book flights')
    expect(html.match(/class="chip"/g)).toHaveLength(2) // not three: the parent is a label, and the hotel is archived
    expect(html).toContain('↳</span> Plan trip') // shown only as the reference on its subtasks
    expect(html).toContain('quad__time">30m') // the Do quadrant's total
    expect(html).toContain('2/2') // both open thoughts are sorted
  })

  it('Plan counts only the actionable thoughts and totals each day', () => {
    seed()
    expect(getState().items).toHaveLength(4)
    const html = render(<PlanMode />)
    expect(html).toContain('Your week is planned')
    expect(html).toContain('30m') // today's total
  })

  it('Today shows the add line with its lane and time chips, and marks what is picked', () => {
    seed()
    Object.assign(snapshot, { todayAdd: { quadrant: 'do', minutes: 30, cursor: { row: 1, col: 2 } } })
    setState({ todayAdd: { quadrant: 'do', minutes: 30, cursor: { row: 1, col: 2 } } })
    const html = render(<TodayMode />)
    expect(html).toContain('Add a task for today')
    expect(html).toContain('today-add__attrs')
    expect(html.match(/class="attr"/g)).toHaveLength(8) // Do, Admin and six times
    expect(html.match(/data-on="true"/g)).toHaveLength(2)
    expect(html.match(/data-cursor="true"/g)).toHaveLength(1) // the arrow keys' place: 30m
  })

  it('Today lists the subtasks with times and adds the day up', () => {
    seed()
    const html = render(<TodayMode />)
    expect(html).toContain('book flights')
    expect(html).toContain('~30m')
    // 30m flights + a default 25m for the rent without an estimate; the hotel is in the archive.
    expect(html).toContain('~55m</b> left') // a guess, since one task has no time
    expect(html).toContain('start now')
    expect(html).toContain('1 without a time, counted as 25m')
    expect(html).not.toContain('out of your head')
    expect(html).toContain('Session 1')
    expect(html).not.toMatch(/row__text">Plan trip/)
  })

  it('Today with a session running shows its clock, the task it is on, and the pill', () => {
    seed()
    const items = getState().items
    const run = { session: 1, queue: ['f', 'r'], index: 0, startedAt: Date.now() - 5 * 60_000, phase: 'running' as const }
    Object.assign(snapshot, { run })
    setState({ run })
    const html = render(<TodayMode />)
    expect(html).toContain('session 1 · running')
    expect(html).toContain('book flights') // the task it's on
    expect(html).toContain('>now<')
    expect(html).toContain('of 30m') // its window
    expect(html).toContain('Next: <b>pay rent</b> · 25m')
    expect(html).toContain('done by') // a live finish time instead of an invitation
    expect(html).not.toContain('start now')
    expect(html).toContain('data-focusing="true"') // the screen gives the task the room and dims the rest
    expect(items).toHaveLength(4)
    expect(render(<FocusPill />)).toMatch(/\d\d:\d\d/)
  })

  it('Today highlights the picked tasks, and Sort and Plan mark them and say how many', () => {
    seed()
    load([
      { ...base, id: 'a', text: 'one', quadrant: 'do', slot: today, minutes: 5 },
      { ...base, id: 'b', text: 'two', quadrant: 'do', slot: today, minutes: 10 },
    ])
    const picked = { anchor: 'a', ids: ['a', 'b'] }
    const decks = { sort: { cursor: 'b', trail: [], resume: null }, plan: { cursor: 'b', trail: [], resume: null } }
    Object.assign(snapshot, { picked, decks })
    setState({ picked, decks, todayCursor: 'b' })
    expect(render(<TodayMode />).match(/data-picked="true"/g)).toHaveLength(2)
    const sort = render(<SortMode />)
    expect(sort.match(/data-picked="true"/g)).toHaveLength(2)
    expect(sort).toContain('2 picked')
    expect(render(<PlanMode />)).toContain('data-picked="true"')
  })

  it('the focus view still shows when everything will be done, across every session', () => {
    seed()
    load(getState().items.map((i) => (i.id === 'r' ? { ...i, session: 2 } : i)))
    const run = { session: 1, queue: ['f'], index: 0, startedAt: Date.now(), phase: 'running' as const }
    Object.assign(snapshot, { run })
    setState({ run })
    const html = render(<TodayMode />)
    expect(html).toContain('data-focusing="true"')
    expect(html).toContain('done by')
    expect(html).toContain('across 2 sessions')
  })

  it('the focus view shows an interruption in progress, holding the task', () => {
    seed()
    const run = {
      session: 1, queue: ['f', 'r'], index: 0, startedAt: Date.now() - 5 * 60_000, phase: 'running' as const,
      pause: { label: 'Call mum', startedAt: Date.now() - 60_000, minutes: null },
    }
    Object.assign(snapshot, { run })
    setState({ run })
    const html = render(<TodayMode />)
    expect(html).toContain('paused')
    expect(html).toContain('Call mum')
    expect(html).toContain('and counting')
    expect(html).toContain('Held: <b>book flights</b>')
    expect(html.replaceAll('&#x27;', "'")).toContain("I'm back")
    expect(render(<FocusPill />)).toContain('paused: Call mum')
  })

  it('the focus view offers the quick line, with a preset for each of 1–4', () => {
    seed()
    const run = { session: 1, queue: ['f', 'r'], index: 0, startedAt: Date.now(), phase: 'running' as const }
    Object.assign(snapshot, { run, pausing: true })
    setState({ run, pausing: true })
    const html = render(<TodayMode />)
    expect(html).toContain('What came up?')
    for (const p of ['Bathroom 5m', 'Break 10m', 'Call', 'Chore 15m']) expect(html).toContain(p)
  })

  it('Today is not in focus view before a session starts or after time is up', () => {
    seed()
    expect(render(<TodayMode />)).not.toContain('data-focusing')
    const run = { session: 1, queue: ['f', 'r'], index: 1, startedAt: 0, phase: 'over' as const }
    Object.assign(snapshot, { run })
    setState({ run })
    expect(render(<TodayMode />)).not.toContain('data-focusing')
  })

  it('Today after time is up asks what to do with what is left', () => {
    seed()
    const run = { session: 1, queue: ['f', 'r'], index: 1, startedAt: 0, phase: 'over' as const }
    Object.assign(snapshot, { run })
    setState({ run })
    const html = render(<TodayMode />)
    expect(html.replaceAll('&#x27;', "'")).toContain("session 1 · time's up")
    expect(html).toContain('<b>2</b> not finished')
    expect(html).toContain('Carry on')
    expect(render(<FocusPill />).replaceAll('&#x27;', "'")).toContain("time's up")
  })

  it('Today splits sessions under their own headings, named when you named them', () => {
    seed()
    load(getState().items.map((i) => (i.id === 'r' ? { ...i, session: 2 } : i)))
    Object.assign(snapshot, { sessionNames: { [today]: { 2: 'Admin' } } })
    setState({ sessionNames: { [today]: { 2: 'Admin' } } })
    const html = render(<TodayMode />)
    expect(html).toContain('Session 1')
    expect(html).toContain('Admin')
    expect(html.indexOf('Admin')).toBeLessThan(html.indexOf('pay rent'))
    expect(html.indexOf('pay rent')).toBeGreaterThan(html.indexOf('book flights'))
    // Plan's column for the day shows the same sessions.
    expect(render(<PlanMode />)).toContain('class="day__session"')
  })

  it('a finished task goes straight to the Archive, never tagged late', () => {
    const yesterday = addDays(today, -1)
    const stamp = (day: string) => new Date(`${day}T09:00:00`).getTime()
    load([
      { ...base, id: 'a', text: 'late but done', slot: yesterday, done: true, doneAt: Date.now() },
      { ...base, id: 'b', text: 'done last week', slot: yesterday, done: true, doneAt: stamp(addDays(today, -3)) },
      { ...base, id: 'c', text: 'still late', slot: yesterday },
    ])
    const dump = render(<DumpMode />)
    expect(dump).not.toContain('late but done')
    expect(dump).not.toContain('done last week')
    expect(dump.match(/1d late/g)).toHaveLength(1) // only the one that is really late
    const todayHtml = render(<TodayMode />)
    expect(todayHtml).toContain('still late')
    expect(todayHtml).not.toContain('late but done')
    expect(todayHtml).toContain('1/2 done') // ticked off today out of what was on today's plate
    const archive = render(<ArchiveMode />)
    expect(archive).toContain('done last week')
    expect(archive).toContain('late but done')
    expect(archive).not.toContain('late<')
  })

  it('? explains the core features in the order you use them, and keeps every key a tab away', () => {
    Object.assign(snapshot, { helpOpen: true, helpTab: 'guide' })
    setState({ helpOpen: true, helpTab: 'guide' })
    const guide = render(<Help />).replaceAll('&#x27;', "'")
    const order = ['Empty your head', 'Decide what matters', 'Give it a day', 'Do one thing at a time']
    const at = order.map((t) => guide.indexOf(t))
    expect(at).not.toContain(-1)
    expect(at).toEqual([...at].sort((x, y) => x - y))
    for (const t of ['Change anything, from anywhere', 'Work through a session', 'Nothing gets lost']) expect(guide).toContain(t)
    Object.assign(snapshot, { helpTab: 'keys' })
    setState({ helpTab: 'keys' })
    const keys = render(<Help />)
    expect(keys).toContain('Every key')
    expect(keys).toContain('File under Do')
  })

  it('searching "archive" puts Open archive first, from every screen', () => {
    for (const mode of ['dump', 'sort', 'plan', 'today', 'archive'] as const) {
      for (const q of ['archive', 'arch', 'Archive']) {
        const first = buildSections(q, mode, [{ ...base, id: 'x', text: 'archive the old files' }])[0].rows[0]
        expect(first.kind === 'command' && first.cmd.id).toBe('mode.archive')
      }
    }
  })

  it('search puts a thought that contains the words above a command that only matches scattered letters', () => {
    const sections = buildSections('jap', 'dump', [{ ...base, id: 'j', text: 'Plan the Japan trip' }])
    expect(sections[0].title).toBe('Thoughts')
    expect(sections.flatMap((s) => s.rows).some((r) => r.kind === 'command' && r.cmd.id === 'data.import')).toBe(false)
  })

  it('⌘S opens the day ready to type, with the usual picks', () => {
    load([{ ...base, id: 'a', text: 'call dentist' }])
    const sheet = { ids: ['a'], purpose: 'field' as const, row: 'slot' as const, col: 0, query: '', receipt: null, nonce: 3 }
    Object.assign(snapshot, { sheet })
    setState({ sheet })
    const html = render(<ThoughtSheet />)
    expect(html).toContain('call dentist')
    expect(html).toContain('aria-label="Day"')
    for (const pick of ['Today', 'Tomorrow', 'Later']) expect(html).toContain(pick)
    expect(html).not.toContain('No day') // nothing to clear yet
  })
})
