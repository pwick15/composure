import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, todayKey } from '../lib/dates'
import { makeBackup } from '../lib/export'
import { todayList, todayProgress, todaySessions } from '../lib/selectors'
import { parentOf, treeOrder } from '../lib/tree'
import * as a from './actions'
import { importFile } from './exporters'
import { getState, setState, useStore } from './store'

const initial = useStore.getState()
const texts = () => getState().items.map((i) => i.text)

beforeEach(() => {
  setState(initial, true)
})

function dump(...lines: string[]) {
  for (const line of lines) {
    a.startDraft()
    const draft = getState().editing!
    a.editorEnter(draft, line)
  }
  const e = getState().editing
  if (e) a.editorExit(e, '')
}

describe('dump', () => {
  it('Enter commits the line and opens a fresh draft below it', () => {
    a.startDraft('b')
    const first = getState().editing!
    a.editorEnter(first, 'buy milk')
    const s = getState()
    expect(texts()).toEqual(['buy milk'])
    expect(s.editing).toMatchObject({ kind: 'draft', afterId: s.items[0].id })
  })

  it('Enter on an empty draft finishes without creating an item', () => {
    a.startDraft()
    a.editorEnter(getState().editing!, '   ')
    expect(getState().items).toHaveLength(0)
    expect(getState().editing).toBeNull()
  })

  it('inserts after the selected item', () => {
    dump('one', 'three')
    setState({ selectedId: getState().items[0].id })
    a.startDraft()
    a.editorEnter(getState().editing!, 'two')
    expect(texts()).toEqual(['one', 'two', 'three'])
  })

  it('Backspace on an empty line deletes it and edits the previous one', () => {
    dump('one', 'two')
    const two = getState().items[1].id
    a.startEdit(two)
    a.editorBackspaceEmpty(getState().editing!)
    expect(texts()).toEqual(['one'])
    expect(getState().editing).toMatchObject({ kind: 'item', id: getState().items[0].id })
  })

  it('pasting a list is one undo step', () => {
    dump('first')
    a.startDraft()
    a.editorPaste(getState().editing!, 'a', ['b', 'c'])
    expect(texts()).toEqual(['first', 'a', 'b', 'c'])
    a.undo()
    expect(texts()).toEqual(['first'])
    a.redo()
    expect(texts()).toEqual(['first', 'a', 'b', 'c'])
  })

  it('deleting is undoable', () => {
    dump('keep', 'oops')
    setState({ selectedId: getState().items[1].id })
    a.dumpDelete()
    expect(texts()).toEqual(['keep'])
    a.undo()
    expect(texts()).toEqual(['keep', 'oops'])
  })
})

const quadrants = () => Object.fromEntries(getState().items.map((i) => [i.text, i.quadrant]))

describe('sort', () => {
  it('a filing key applies at once and moves to the next unsorted thought', () => {
    dump('a', 'b', 'c')
    a.setMode('sort')
    expect(a.sortCurrent()?.text).toBe('a')
    a.deckFile('sort', 'schedule')
    expect(quadrants().a).toBe('schedule')
    expect(a.sortCurrent()?.text).toBe('b')
  })

  it('⌫ brings back the last filed thought, and re-filing returns to where you were', () => {
    dump('a', 'b', 'c')
    a.setMode('sort')
    a.deckFile('sort', 'do')
    a.deckFile('sort', 'drop') // oops: b was meant for Schedule
    expect(a.sortCurrent()?.text).toBe('c')
    a.deckBack('sort')
    expect(a.sortCurrent()?.text).toBe('b')
    a.deckFile('sort', 'schedule')
    expect(quadrants().b).toBe('schedule')
    expect(a.sortCurrent()?.text).toBe('c')
  })

  it('⌫ steps further back each time', () => {
    dump('a', 'b', 'c')
    a.setMode('sort')
    a.deckFile('sort', 'do')
    a.deckFile('sort', 'do')
    a.deckBack('sort')
    a.deckBack('sort')
    expect(a.sortCurrent()?.text).toBe('a')
  })

  it('undo reverts the filing and brings the thought back to the tray', () => {
    dump('a', 'b')
    a.setMode('sort')
    a.deckFile('sort', 'drop')
    expect(a.sortCurrent()?.text).toBe('b')
    a.undo()
    expect(quadrants().a).toBeNull()
    expect(a.sortCurrent()?.text).toBe('a')
    a.deckFile('sort', 'do')
    expect(a.sortCurrent()?.text).toBe('b')
  })

  it('↑/↓ walk unsorted, then Do, Schedule, Delegate, Drop, stopping at the ends', () => {
    dump('u', 'd', 's')
    setState({
      items: getState().items.map((i) => ({ ...i, quadrant: i.text === 'd' ? 'do' : i.text === 's' ? 'schedule' : null })),
    })
    a.setMode('sort')
    const seen = [a.sortCurrent()?.text]
    for (let i = 0; i < 3; i++) {
      a.deckMove('sort', 1)
      seen.push(a.sortCurrent()?.text)
    }
    expect(seen).toEqual(['u', 'd', 's', 's'])
  })

  it('re-filing a thought you moved to sends you back to the queue', () => {
    dump('u1', 'u2', 'd')
    setState({ items: getState().items.map((i) => ({ ...i, quadrant: i.text === 'd' ? 'do' : null })) })
    a.setMode('sort')
    a.deckJump('sort', 1) // → into Do
    expect(a.sortCurrent()?.text).toBe('d')
    a.deckFile('sort', 'delegate')
    expect(quadrants().d).toBe('delegate')
    expect(a.sortCurrent()?.text).toBe('u1')
  })

  it('↵ keeps a filed thought as it is and moves on', () => {
    dump('u', 'd')
    setState({ items: getState().items.map((i) => ({ ...i, quadrant: i.text === 'd' ? 'do' : null })) })
    a.setMode('sort')
    a.deckMove('sort', 1)
    a.deckKeep('sort')
    expect(quadrants().d).toBe('do')
    expect(a.sortCurrent()?.text).toBe('u')
  })

  it('ends with nothing selected once everything is sorted', () => {
    dump('a', 'b')
    a.setMode('sort')
    a.deckFile('sort', 'do')
    a.deckFile('sort', 'drop')
    expect(a.sortCurrent()).toBeNull()
    a.deckBack('sort')
    expect(a.sortCurrent()?.text).toBe('b')
  })
})

describe('plan', () => {
  it('a number applies at once, in priority order', () => {
    dump('later thing', 'urgent thing')
    setState({
      items: getState().items.map((i) => ({ ...i, quadrant: i.text === 'urgent thing' ? 'do' : 'schedule' })),
    })
    a.setMode('plan')
    expect(a.planCurrent()?.text).toBe('urgent thing')
    a.planFileDay(2)
    const urgent = getState().items.find((i) => i.text === 'urgent thing')!
    expect(urgent.slot).toBe(addDays(todayKey(), 1))
    expect(a.planCurrent()?.text).toBe('later thing')
  })

  it('←/→ jump between days, keeping the row', () => {
    dump('t1', 't2', 'm1', 'm2')
    const today = todayKey()
    const tomorrow = addDays(today, 1)
    setState({
      items: getState().items.map((i) => ({ ...i, quadrant: 'do' as const, slot: i.text.startsWith('t') ? today : tomorrow })),
    })
    a.setMode('plan')
    expect(a.planCurrent()).toBeNull() // nothing left to plan
    a.deckMove('plan', 1) // first item: t1
    a.deckMove('plan', 1) // t2
    a.deckJump('plan', 1)
    expect(a.planCurrent()?.text).toBe('m2')
  })

  it('skips dropped items', () => {
    dump('drop me')
    setState({ items: getState().items.map((i) => ({ ...i, quadrant: 'drop' as const })) })
    a.setMode('plan')
    expect(a.planCurrent()).toBeNull()
  })
})

describe('history', () => {
  it('keeps at most 100 undo steps', () => {
    vi.useFakeTimers()
    for (let i = 0; i < 120; i++) a.addItems(null, [`t${i}`])
    expect(getState().past).toHaveLength(100)
    vi.useRealTimers()
  })
})

describe('today', () => {
  const plannedToday = (...texts: string[]) => {
    dump(...texts)
    setState({ items: getState().items.map((i) => ({ ...i, quadrant: 'do' as const, slot: todayKey() })) })
    a.setMode('today')
  }

  it('ticking off moves to the next open thing', () => {
    plannedToday('a', 'b', 'c')
    a.todayToggle()
    expect(getState().items.find((i) => i.text === 'a')!.done).toBe(true)
    expect(a.todayCurrent()?.text).toBe('b')
  })

  it('T moves it to tomorrow and selects the next', () => {
    plannedToday('a', 'b')
    a.todayDefer()
    expect(getState().items.find((i) => i.text === 'a')!.slot).toBe(addDays(todayKey(), 1))
    expect(a.todayCurrent()?.text).toBe('b')
    a.undo()
    expect(getState().items.find((i) => i.text === 'a')!.slot).toBe(todayKey())
  })

  it('⌥→ steps through screens and stops at the ends', () => {
    a.setMode('plan')
    a.cycleMode(1)
    expect(getState().mode).toBe('today')
    a.cycleMode(1)
    expect(getState().mode).toBe('today') // the Archive is not a stop on the way
  })
})

// ---------------------------------------------------------------- subtasks

/** Dump order as an outline: subtasks are indented under their parent. */
const outline = () => {
  const { items } = getState()
  return treeOrder(items).map((i) => (i.parentId ? `  ${i.text}` : i.text))
}

/** Types "Plan trip" with subtasks "flights" and "hotel", the way the keyboard does it. */
function tripWithSubtasks() {
  a.startDraft()
  a.editorEnter(getState().editing!, 'Plan trip')
  a.editorIndent(getState().editing!, '', 1)
  a.editorEnter(getState().editing!, 'flights')
  a.editorEnter(getState().editing!, 'hotel')
  a.editorIndent(getState().editing!, '', -1)
  a.editorEnter(getState().editing!, 'Pay rent')
  a.editorExit(getState().editing!, '')
}

describe('subtasks: dump', () => {
  it('Tab on a new line nests it, Enter keeps adding subtasks, ⇧Tab returns to top level', () => {
    tripWithSubtasks()
    expect(outline()).toEqual(['Plan trip', '  flights', '  hotel', 'Pay rent'])
  })

  it('⌥↵ while typing saves the line and opens a subtask line under it', () => {
    a.startDraft()
    a.editorEnter(getState().editing!, 'Plan trip')
    const parent = getState().items[0].id
    expect(getState().editing).toMatchObject({ kind: 'draft', parentId: null })
    a.editorAddSub(getState().editing!, '')
    expect(getState().editing).toMatchObject({ kind: 'draft', parentId: null })
    a.editorExit(getState().editing!, '')

    a.startEdit(parent)
    a.editorAddSub(getState().editing!, 'Plan trip')
    expect(getState().editing).toMatchObject({ kind: 'draft', parentId: parent })
    a.editorEnter(getState().editing!, 'flights')
    expect(outline()).toEqual(['Plan trip', '  flights'])
  })

  it('⌥↵ on a selected parent adds the subtask last; on a subtask, right below it', () => {
    tripWithSubtasks()
    const [trip, flights] = getState().items
    setState({ selectedId: trip.id })
    a.dumpAddSub()
    a.editorEnter(getState().editing!, 'visa')
    expect(outline()).toEqual(['Plan trip', '  flights', '  hotel', '  visa', 'Pay rent'])

    setState({ selectedId: flights.id, editing: null })
    a.dumpAddSub()
    a.editorEnter(getState().editing!, 'insurance')
    expect(outline()).toEqual(['Plan trip', '  flights', '  insurance', '  hotel', '  visa', 'Pay rent'])
  })

  it('a thought typed at the end of the list is top-level, even after a subtask', () => {
    tripWithSubtasks()
    setState({ selectedId: null })
    a.startDraft()
    a.editorEnter(getState().editing!, 'Call mum')
    expect(outline().at(-1)).toBe('Call mum')
  })

  it('Tab on a selected thought nests it under the one above, bringing its subtasks along', () => {
    tripWithSubtasks()
    const rent = getState().items.find((i) => i.text === 'Pay rent')!
    setState({ selectedId: rent.id })
    a.dumpIndent(1)
    expect(outline()).toEqual(['Plan trip', '  flights', '  hotel', '  Pay rent'])
    a.undo()
    expect(outline()).toEqual(['Plan trip', '  flights', '  hotel', 'Pay rent'])

  })

  it('nesting a parent under another flattens its subtasks: one level only', () => {
    tripWithSubtasks()
    a.startDraft()
    a.editorEnter(getState().editing!, 'Errands')
    a.editorExit(getState().editing!, '')
    const byText = (t: string) => getState().items.find((i) => i.text === t)!
    setState({ selectedId: byText('Pay rent').id })
    a.dumpAddSub()
    a.editorEnter(getState().editing!, 'cheque')
    setState({ selectedId: byText('Errands').id, editing: null })
    a.dumpIndent(1)
    expect(outline()).toEqual(['Plan trip', '  flights', '  hotel', 'Pay rent', '  cheque', '  Errands'])
    setState({ selectedId: byText('Pay rent').id })
    a.dumpIndent(1)
    expect(outline()).toEqual(['Plan trip', '  flights', '  hotel', '  Pay rent', '  cheque', '  Errands'])
  })

  it('⇧Tab pops a subtask out below its group', () => {
    tripWithSubtasks()
    const flights = getState().items.find((i) => i.text === 'flights')!
    setState({ selectedId: flights.id })
    a.dumpIndent(-1)
    expect(outline()).toEqual(['Plan trip', '  hotel', 'flights', 'Pay rent'])
  })

  it('there is nothing to nest the first line under', () => {
    dump('only')
    setState({ selectedId: getState().items[0].id })
    a.dumpIndent(1)
    expect(outline()).toEqual(['only'])
  })

  it('↑/↓ walk subtasks in the order they are shown', () => {
    tripWithSubtasks()
    setState({ selectedId: null })
    const seen: string[] = []
    for (let i = 0; i < 4; i++) {
      a.dumpSelect(1)
      seen.push(getState().items.find((it) => it.id === getState().selectedId)!.text)
    }
    expect(seen).toEqual(['Plan trip', 'flights', 'hotel', 'Pay rent'])
  })

  it('⇧↑/⇧↓ move a parent with its subtasks, and a subtask among its siblings', () => {
    tripWithSubtasks()
    const byText = (t: string) => getState().items.find((i) => i.text === t)!.id
    a.moveItem(byText('Plan trip'), 1)
    expect(outline()).toEqual(['Pay rent', 'Plan trip', '  flights', '  hotel'])
    a.moveItem(byText('hotel'), -1)
    expect(outline()).toEqual(['Pay rent', 'Plan trip', '  hotel', '  flights'])
    a.moveItem(byText('hotel'), -1)
    expect(outline()).toEqual(['Pay rent', 'Plan trip', '  hotel', '  flights'])
  })

  it('deleting a parent deletes its subtasks, in one undo step', () => {
    tripWithSubtasks()
    setState({ selectedId: getState().items[0].id })
    a.dumpDelete()
    expect(outline()).toEqual(['Pay rent'])
    expect(getState().selectedId).toBe(getState().items[0].id)
    a.undo()
    expect(outline()).toEqual(['Plan trip', '  flights', '  hotel', 'Pay rent'])
  })

  it('deleting the last subtask makes the parent a plain thought again', () => {
    tripWithSubtasks()
    for (const t of ['flights', 'hotel']) {
      setState({ selectedId: getState().items.find((i) => i.text === t)!.id })
      a.dumpDelete()
    }
    expect(outline()).toEqual(['Plan trip', 'Pay rent'])
    a.setMode('sort')
    expect(a.sortCurrent()?.text).toBe('Plan trip')
  })

  it('ticking a parent ticks its subtasks; clearing completed takes the whole group', () => {
    tripWithSubtasks()
    a.toggleDone(getState().items[0].id)
    expect(getState().items.filter((i) => i.done).map((i) => i.text)).toEqual(['flights', 'hotel'])
    a.clearDone()
    expect(outline()).toEqual(['Pay rent'])
  })

  it('pasting onto a subtask adds more subtasks to its parent', () => {
    tripWithSubtasks()
    setState({ selectedId: getState().items.find((i) => i.text === 'flights')!.id })
    a.pasteLines(['visa', 'insurance'])
    expect(outline()).toEqual(['Plan trip', '  flights', '  visa', '  insurance', '  hotel', 'Pay rent'])
  })
})

describe('subtasks: sort, plan and today', () => {
  it('Sort and Plan treat each subtask as its own thought and skip the parent', () => {
    tripWithSubtasks()
    a.setMode('sort')
    const seen: string[] = []
    for (let i = 0; i < 3; i++) {
      seen.push(a.sortCurrent()!.text)
      a.deckFile('sort', 'do')
    }
    expect(seen).toEqual(['flights', 'hotel', 'Pay rent'])
    expect(a.sortCurrent()).toBeNull()

    a.setMode('plan')
    expect(a.planCurrent()?.text).toBe('flights')
    a.planFileDay(1)
    expect(getState().items.find((i) => i.text === 'flights')!.slot).toBe(todayKey())
    expect(getState().items.find((i) => i.text === 'Plan trip')!.slot).toBeNull()
  })

  it('subtasks of a thought that was already filed start where it is', () => {
    dump('Plan trip')
    a.setMode('sort')
    a.deckFile('sort', 'schedule')
    a.setMode('dump')
    setState({ selectedId: getState().items[0].id })
    a.dumpAddSub()
    a.editorEnter(getState().editing!, 'flights')
    expect(getState().items.find((i) => i.text === 'flights')).toMatchObject({ quadrant: 'schedule' })
  })

  it('Today lists only subtasks, each pointing back at its parent', () => {
    tripWithSubtasks()
    setState({ items: getState().items.map((i) => ({ ...i, quadrant: 'do' as const, slot: todayKey() })) })
    a.setMode('today')
    expect(todayList(getState().items, todayKey()).map((i) => i.text)).toEqual(['flights', 'hotel', 'Pay rent'])
    expect(parentOf(getState().items, a.todayCurrent()!)?.text).toBe('Plan trip')
  })
})

// ---------------------------------------------------------------- time estimates

const minutesOf = (text: string) => getState().items.find((i) => i.text === text)!.minutes

describe('time estimates', () => {
  const plannedToday = (...texts: string[]) => {
    dump(...texts)
    setState({ items: getState().items.map((i) => ({ ...i, quadrant: 'do' as const, slot: todayKey() })) })
    a.setMode('today')
  }

  it('1–6 in Sort sets the time and leaves the card where it is', () => {
    dump('a', 'b')
    a.setMode('sort')
    a.estimatePreset(3)
    expect(minutesOf('a')).toBe(30)
    expect(a.sortCurrent()?.text).toBe('a')
    a.deckFile('sort', 'do')
    expect(a.sortCurrent()?.text).toBe('b')
    expect(minutesOf('a')).toBe(30)
  })

  it('= and - step the estimate in Sort, Plan and Today, and undo takes it back', () => {
    dump('a')
    a.setMode('sort')
    a.deckFile('sort', 'do')
    a.setMode('plan')
    a.estimateStep(1)
    expect(minutesOf('a')).toBe(15)
    a.estimateStep(1)
    expect(minutesOf('a')).toBe(25)
    a.undo()
    expect(minutesOf('a')).toBe(15)

    a.planFileDay(1)
    a.setMode('today')
    a.estimateStep(-1)
    expect(minutesOf('a')).toBe(10)
  })

  it('does nothing in Dump, and says why', () => {
    dump('a')
    a.estimateStep(1)
    expect(minutesOf('a')).toBeNull()
    expect(getState().toasts.at(-1)?.text).toMatch(/Sort, Plan and Today/)
  })

  it('Today lists quickest first inside a quadrant, and re-sorts when an estimate changes', () => {
    plannedToday('slow', 'quick')
    setState({
      items: getState().items.map((i) => ({ ...i, quadrant: 'do' as const, minutes: i.text === 'slow' ? 60 : 5 })),
    })
    const order = () => todayList(getState().items, todayKey()).map((i) => i.text)
    expect(order()).toEqual(['quick', 'slow'])
    a.todayFocus(getState().items.find((i) => i.text === 'quick')!.id)
    for (let i = 0; i < 7; i++) a.estimateStep(1) // 5 → 10 → 15 → 25 → 30 → 45 → 60 → 90m
    expect(order()).toEqual(['slow', 'quick'])
  })
})

// ---------------------------------------------------------------- export + import

describe('export and import', () => {
  const file = (text: string, name = 'in.json') => new File([text], name)

  /** Builds a small, fully filled-in world: a parent with subtasks, times, filing and a day. */
  function world() {
    tripWithSubtasks()
    setState({
      items: getState().items.map((i) => ({
        ...i,
        quadrant: i.text === 'flights' ? ('do' as const) : null,
        slot: i.text === 'flights' ? todayKey() : null,
        minutes: i.text === 'flights' ? 45 : null,
        done: i.text === 'hotel',
        doneAt: i.text === 'hotel' ? 1_700_000_000_000 : null,
      })),
    })
    return getState().items
  }

  it('an export imports into an empty instance exactly as it was', async () => {
    const before = world()
    const exported = makeBackup(before)
    setState(initial, true)
    await importFile(file(exported))
    expect(getState().items).toEqual(before)
    expect(getState().toasts.at(-1)?.text).toBe('Imported 4 thoughts')
  })

  it('importing never overwrites: what is already here stays, only new thoughts are added', async () => {
    const before = world()
    const exported = makeBackup(before)
    setState({ items: before.map((i) => (i.text === 'flights' ? { ...i, text: 'flights (edited here)' } : i)) })
    await importFile(file(exported))
    expect(getState().items).toHaveLength(4)
    expect(getState().items.map((i) => i.text)).toContain('flights (edited here)')
    expect(getState().items.map((i) => i.text)).not.toContain('flights')
    expect(getState().toasts.at(-1)?.text).toBe('Already here: all 4 thoughts')

    a.removeItem(before[3].id) // Pay rent is gone locally; importing brings it back, once
    await importFile(file(exported))
    expect(getState().items.map((i) => i.text)).toContain('Pay rent')
    expect(getState().toasts.at(-1)?.text).toBe('Imported 1 thought (3 already here)')
  })

  it('import is one undo step', async () => {
    const exported = makeBackup(world())
    setState(initial, true)
    await importFile(file(exported))
    a.undo()
    expect(getState().items).toHaveLength(0)
  })

  it('a Markdown list becomes thoughts: headings skipped, [x] kept as done', async () => {
    dump('existing')
    await importFile(file('# Plan\n\n## Today\n- [ ] call dentist\n- [x] pay rent (10m)\n* buy milk\n---\n1. renew passport\n', 'x.md'))
    expect(getState().items.map((i) => [i.text, i.done])).toEqual([
      ['existing', false],
      ['call dentist', false],
      ['pay rent (10m)', true],
      ['buy milk', false],
      ['renew passport', false],
    ])
  })

  it('says so when a file is not an export, rather than guessing', async () => {
    await importFile(file('{ "hello": "world" }'))
    expect(getState().items).toHaveLength(0)
    expect(getState().toasts.at(-1)?.text).toMatch(/Import failed/)
    await importFile(file('{ nope'))
    expect(getState().toasts.at(-1)?.text).toBe('Import failed: not a Composure export')
    await importFile(file(''))
    expect(getState().toasts.at(-1)?.text).toBe('Nothing to import in that file')
  })
})

// ---------------------------------------------------------------- add on Today

describe('add on Today', () => {
  const task = (text: string) => getState().items.find((i) => i.text === text)!

  it('N, type, ↵ puts a task in today\'s plan and keeps the line open for the next', () => {
    a.setMode('today')
    a.todayAddOpen()
    a.todayAddEnter('call dentist')
    expect(task('call dentist')).toMatchObject({ slot: todayKey(), quadrant: null, minutes: null, done: false })
    expect(getState().todayAdd).not.toBeNull()
    expect(a.todayCurrent()?.text).toBe('call dentist')
  })

  it('quadrant and time picked on the line are applied, and stay picked for the next task', () => {
    a.setMode('today')
    a.todayAddOpen()
    a.todayAddQuadrant('do')
    a.todayAddMinutes(15)
    a.todayAddEnter('call dentist')
    a.todayAddEnter('pay rent')
    expect(task('call dentist')).toMatchObject({ quadrant: 'do', minutes: 15 })
    expect(task('pay rent')).toMatchObject({ quadrant: 'do', minutes: 15 })
  })

  it('picking the same quadrant or time again clears it', () => {
    a.setMode('today')
    a.todayAddOpen()
    a.todayAddQuadrant('schedule')
    a.todayAddQuadrant('schedule')
    a.todayAddMinutes(30)
    a.todayAddMinutes(30)
    expect(getState().todayAdd).toEqual({ quadrant: null, minutes: null, cursor: null })
  })

  it('an empty ↵ closes the line; Esc keeps what was typed', () => {
    a.setMode('today')
    a.todayAddOpen()
    a.todayAddEnter('  ')
    expect(getState().todayAdd).toBeNull()
    expect(getState().items).toHaveLength(0)

    a.todayAddOpen()
    a.todayAddClose('unfinished thought')
    expect(getState().todayAdd).toBeNull()
    expect(task('unfinished thought').slot).toBe(todayKey())
    a.todayAddClose('again') // closing twice (Esc, then the blur it causes) adds nothing more
    expect(getState().items).toHaveLength(1)
  })

  it('a pasted list adds every line, and is one undo step', () => {
    a.setMode('today')
    a.todayAddOpen()
    a.todayAddQuadrant('delegate')
    a.todayAddPaste('one', ['two', 'three'])
    expect(getState().items.map((i) => [i.text, i.quadrant])).toEqual([
      ['one', 'delegate'],
      ['two', 'delegate'],
      ['three', 'delegate'],
    ])
    a.undo()
    expect(getState().items).toHaveLength(0)
  })

  it('new tasks land in the list in order: quadrant, then quickest first, and add to the day total', () => {
    a.setMode('today')
    a.todayAddOpen()
    a.todayAddMinutes(60)
    a.todayAddQuadrant('do')
    a.todayAddEnter('long one')
    a.todayAddMinutes(60)
    a.todayAddMinutes(5)
    a.todayAddEnter('quick one')
    expect(todayList(getState().items, todayKey()).map((i) => i.text)).toEqual(['quick one', 'long one'])
    expect(a.todayCurrent()?.text).toBe('quick one')
  })

  it('leaving the screen closes the line', () => {
    a.setMode('today')
    a.todayAddOpen()
    a.setMode('plan')
    expect(getState().todayAdd).toBeNull()
  })

  it('↓ moves into the options, arrows walk them, ↵ picks, ⇧↵ adds; nothing needs a shortcut', () => {
    a.setMode('today')
    a.todayAddOpen()
    expect(a.todayAddArrow('right')).toBe(false) // in the text, sideways arrows belong to the text
    expect(a.todayAddArrow('up')).toBe(false)
    expect(a.todayAddArrow('down')).toBe(true)
    expect(getState().todayAdd?.cursor).toEqual({ row: 0, col: 0 })
    a.todayAddArrow('right')
    a.todayAddArrow('right') // Do → Schedule → Delegate
    a.todayAddArrow('right') // stops at the end of the row
    a.todayAddPick()
    expect(getState().todayAdd?.quadrant).toBe('delegate')
    a.todayAddArrow('down')
    expect(getState().todayAdd?.cursor).toEqual({ row: 1, col: 0 })
    a.todayAddArrow('right')
    a.todayAddArrow('right')
    a.todayAddPick() // 5m → 15m → 30m
    expect(getState().todayAdd?.minutes).toBe(30)
    a.todayAddArrow('down') // no row below: stays put
    expect(getState().todayAdd?.cursor).toEqual({ row: 1, col: 2 })

    a.todayAddEnter('write report')
    expect(task('write report')).toMatchObject({ quadrant: 'delegate', minutes: 30 })
    expect(getState().todayAdd?.cursor).toBeNull() // back in the text for the next one
  })

  it('↵ on a picked option clears it; ↑ from the first row goes back to the text', () => {
    a.setMode('today')
    a.todayAddOpen()
    a.todayAddArrow('down')
    a.todayAddPick()
    expect(getState().todayAdd?.quadrant).toBe('do')
    a.todayAddPick()
    expect(getState().todayAdd?.quadrant).toBeNull()
    a.todayAddArrow('up')
    expect(getState().todayAdd?.cursor).toBeNull()
  })

  it('moving down a row starts on what is already picked there', () => {
    a.setMode('today')
    a.todayAddOpen()
    a.todayAddMinutes(60)
    a.todayAddArrow('down')
    a.todayAddArrow('down')
    expect(getState().todayAdd?.cursor).toEqual({ row: 1, col: 3 })
  })
})

// ---------------------------------------------------------------- work sessions

describe('work sessions', () => {
  const T0 = new Date('2026-10-13T09:00:00').getTime()
  const MIN = 60_000

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
  })
  afterEach(() => vi.useRealTimers())

  const passMinutes = (n: number) => {
    vi.setSystemTime(Date.now() + n * MIN)
    a.sessionSync()
  }

  /** Tasks for today, all in the Do quadrant: [text, minutes, session]. */
  function day(...tasks: [string, number | null, number?][]) {
    dump(...tasks.map(([t]) => t))
    setState({
      items: getState().items.map((i) => {
        const [, minutes, session = 1] = tasks.find(([t]) => t === i.text)!
        return { ...i, quadrant: 'do' as const, slot: todayKey(), minutes, session }
      }),
    })
    a.setMode('today')
  }
  const activeText = () => {
    const { run, items } = getState()
    return items.find((i) => i.id === run?.queue[run.index])?.text
  }
  const done = (t: string) => getState().items.find((i) => i.text === t)!.done

  it('F starts the selected task\'s session with its open tasks, quickest first, and highlights the first', () => {
    day(['long', 60], ['quick', 5], ['other session', 30, 2])
    a.sessionToggle()
    const { run } = getState()
    expect(run).toMatchObject({ session: 1, index: 0, phase: 'running' })
    expect(run!.queue.map((id) => getState().items.find((i) => i.id === id)!.text)).toEqual(['quick', 'long'])
    expect(a.todayCurrent()?.text).toBe('quick')
  })

  it('moves on to the next task when a window runs out, without ticking anything off', () => {
    day(['a', 10], ['b', 20])
    a.sessionStart()
    passMinutes(9)
    expect(activeText()).toBe('a')
    passMinutes(2)
    expect(activeText()).toBe('b')
    expect(a.todayCurrent()?.text).toBe('b') // the highlight follows
    expect(done('a')).toBe(false)
    expect(getState().toasts.at(-1)?.text).toMatch(/Time's up on "a"/)
  })

  it('ticking the active task off early starts the next window straight away', () => {
    day(['a', 20], ['b', 30])
    a.sessionStart()
    passMinutes(5)
    a.todayToggle()
    expect(activeText()).toBe('b')
    expect(getState().run!.startedAt).toBe(Date.now())
    passMinutes(29)
    expect(activeText()).toBe('b') // b has its full 30 minutes from when it began
    passMinutes(2)
    expect(getState().run!.phase).toBe('over')
  })

  it('catches up after the tab slept through several windows', () => {
    day(['a', 10], ['b', 10], ['c', 10])
    a.sessionStart()
    passMinutes(25)
    expect(activeText()).toBe('c')
    expect(getState().run!.startedAt).toBe(T0 + 20 * MIN)
  })

  it('when time is up the unfinished tasks wait for you; more time and ↵ carry on', () => {
    day(['a', 10], ['b', 10])
    a.sessionStart()
    a.todayToggle() // a is done early; b begins now
    expect(activeText()).toBe('b')
    passMinutes(12)
    expect(getState().run).toMatchObject({ phase: 'over' })
    expect(getState().items.filter((i) => !i.done).map((i) => i.text)).toEqual(['b'])
    expect(a.todayCurrent()?.text).toBe('b')

    a.estimateStep(1) // 10m → 15m: it needs a bit longer
    expect(getState().items.find((i) => i.text === 'b')!.minutes).toBe(15)
    a.sessionStart() // ↵ in the "over" state carries on
    expect(getState().run).toMatchObject({ phase: 'running', index: 0, startedAt: Date.now() })
    expect(activeText()).toBe('b')
    passMinutes(14)
    expect(activeText()).toBe('b')
    a.todayToggle()
    expect(getState().run).toBeNull()
    expect(getState().toasts.at(-1)?.text).toMatch(/done/i)
  })

  it('ticking off everything left after time is up finishes the session', () => {
    day(['a', 5])
    a.sessionStart()
    passMinutes(6)
    expect(getState().run).toMatchObject({ phase: 'over' })
    a.todayToggle()
    expect(getState().run).toBeNull()
  })

  it('more time on the active task pushes its window out', () => {
    day(['a', 25], ['b', 30])
    a.sessionStart()
    passMinutes(24)
    a.estimateStep(1) // 25m → 30m
    passMinutes(4)
    expect(activeText()).toBe('a')
    passMinutes(2)
    expect(activeText()).toBe('b')
  })

  it('a task with no estimate gets a 25 minute window', () => {
    day(['quick', 5], ['unknown', null]) // unknown ones come last
    a.sessionStart()
    passMinutes(6)
    expect(activeText()).toBe('unknown')
    passMinutes(23)
    expect(activeText()).toBe('unknown')
    passMinutes(2)
    expect(getState().run!.phase).toBe('over')
  })

  it('a task moved to tomorrow drops out of the running session', () => {
    day(['a', 10], ['b', 10])
    a.sessionStart()
    a.todayDefer()
    expect(activeText()).toBe('b')
  })

  it('F stops it, and ↵ never does', () => {
    day(['a', 10])
    a.sessionStart()
    a.sessionStart()
    expect(getState().run).not.toBeNull()
    a.sessionToggle()
    expect(getState().run).toBeNull()
  })

  it('⇧→ splits a task into the next session, ⇧← brings it back, and empty sessions vanish', () => {
    day(['a', 10], ['b', 20])
    const sessions = () => todaySessions(getState().items, todayKey()).map((g) => g.items.map((i) => i.text))
    expect(a.todayCurrent()?.text).toBe('a')
    a.todayMoveSession(1)
    expect(sessions()).toEqual([['b'], ['a']])
    expect(a.todayCurrent()?.text).toBe('a') // the selection stays with the task you moved
    a.todayMoveSession(1) // alone in the last session: nowhere further to go
    expect(sessions()).toEqual([['b'], ['a']])
    a.todayMoveSession(-1)
    expect(sessions()).toEqual([['a', 'b']])
  })

  it('a session starts only the tasks in the selected task\'s session', () => {
    day(['morning', 10, 1], ['afternoon', 20, 2])
    a.todayFocus(getState().items.find((i) => i.text === 'afternoon')!.id)
    a.sessionStart()
    expect(getState().run!.queue).toHaveLength(1)
    expect(activeText()).toBe('afternoon')
  })

  it('a task planned for another day goes back to the first session', () => {
    day(['a', 10, 3])
    a.todayDefer()
    expect(getState().items[0].session).toBe(1)
  })

  it('tasks added on Today join the session you are on', () => {
    day(['a', 10, 2], ['b', 10, 1])
    a.todayFocus(getState().items.find((i) => i.text === 'a')!.id)
    a.todayAddOpen()
    a.todayAddEnter('new one')
    expect(getState().items.find((i) => i.text === 'new one')!.session).toBe(2)
  })
})

describe('archive', () => {
  const task = (text: string) => getState().items.find((i) => i.text === text)!

  it('ticking off records when; reopening clears it', () => {
    dump('a')
    a.toggleDone(getState().items[0].id)
    expect(task('a')).toMatchObject({ done: true })
    expect(task('a').doneAt).toBeTypeOf('number')
    a.toggleDone(getState().items[0].id)
    expect(task('a')).toMatchObject({ done: false, doneAt: null })
  })

  it('goes to the archive at once and Reopen brings it back', () => {
    dump('a', 'b')
    a.toggleDone(task('a').id)
    expect(getState().items.filter((i) => !i.done).map((i) => i.text)).toEqual(['b'])
    a.setMode('archive')
    expect(a.archiveCurrent()?.text).toBe('a')
    a.archiveReopen()
    expect(task('a')).toMatchObject({ done: false, doneAt: null })
    expect(a.archiveCurrent()).toBeNull()
    a.undo()
    expect(task('a').done).toBe(true)
    expect(a.archiveCurrent()?.text).toBe('a')
  })

  it('Dump moves past archived thoughts', () => {
    dump('a', 'b', 'c')
    setState({ items: getState().items.map((i) => (i.text === 'b' ? { ...i, done: true, doneAt: null } : i)) })
    setState({ selectedId: task('a').id })
    a.dumpSelect(1)
    expect(getState().selectedId).toBe(task('c').id)
    a.dumpMove(1) // c has no live sibling after it, a is the only one before
    expect(texts()).toEqual(['a', 'b', 'c'])
  })

  it('ticking off in Today archives it, moves to the next task and counts as progress', () => {
    dump('a', 'b')
    setState({ items: getState().items.map((i) => ({ ...i, slot: todayKey() })) })
    a.setMode('today')
    a.todayFocus(task('a').id)
    a.todayToggle()
    expect(task('a').done).toBe(true)
    expect(todayList(getState().items, todayKey()).map((i) => i.text)).toEqual(['b'])
    expect(getState().todayCursor).toBe(task('b').id)
    expect(todayProgress(getState().items, todayKey())).toEqual({ done: 1, total: 2 })
    a.undo()
    expect(todayList(getState().items, todayKey()).map((i) => i.text)).toEqual(['a', 'b'])
  })

  it('Back returns to the screen the Archive was opened from', () => {
    a.setMode('plan')
    a.setMode('archive')
    expect(getState().archiveFrom).toBe('plan')
    a.archiveBack()
    expect(getState().mode).toBe('plan')
    a.setMode('today')
    a.setMode('archive')
    a.cycleMode(1) // ⌥→ also leaves rather than wandering into another screen
    expect(getState().mode).toBe('today')
  })
})

describe('the same keys on every screen', () => {
  const task = (text: string) => getState().items.find((i) => i.text === text)!
  const done = () => getState().items.filter((i) => i.done).map((i) => i.text)

  it('⌘K ticks off the selected thought in Dump and selects its neighbour', () => {
    dump('a', 'b', 'c')
    setState({ selectedId: task('b').id })
    a.completeCurrent()
    expect(done()).toEqual(['b'])
    expect(getState().selectedId).toBe(task('c').id)
  })

  it('⌘K in Sort and Plan ticks off the card and moves to the next waiting one', () => {
    for (const mode of ['sort', 'plan'] as const) {
      setState(initial, true)
      dump('a', 'b', 'c')
      a.setMode(mode)
      a.completeCurrent()
      expect(done()).toEqual(['a'])
      expect(mode === 'sort' ? a.sortCurrent()?.text : a.planCurrent()?.text).toBe('b')
    }
  })

  it('⌘K in Today ticks off, and in the Archive reopens', () => {
    dump('a', 'b')
    setState({ items: getState().items.map((i) => ({ ...i, slot: todayKey() })) })
    a.setMode('today')
    a.completeCurrent()
    expect(done()).toEqual(['a'])
    a.setMode('archive')
    a.completeCurrent()
    expect(done()).toEqual([])
  })

  it('⌘⌫ deletes the selected thing on every screen and moves on', () => {
    dump('a', 'b', 'c', 'd')
    setState({ selectedId: task('a').id })
    a.deleteCurrent()
    expect(texts()).toEqual(['b', 'c', 'd'])
    a.setMode('sort')
    a.deleteCurrent()
    expect(texts()).toEqual(['c', 'd'])
    expect(a.sortCurrent()?.text).toBe('c')
    setState({ items: getState().items.map((i) => ({ ...i, slot: todayKey() })) })
    a.setMode('today')
    a.deleteCurrent()
    expect(texts()).toEqual(['d'])
    expect(a.todayCurrent()?.text).toBe('d')
    a.undo()
    expect(texts()).toEqual(['c', 'd'])
  })
})

describe('when', () => {
  const task = (text: string) => getState().items.find((i) => i.text === text)!

  it('⌘S then a phrase gives the selected thought that day, and ⌘Z undoes it', () => {
    dump('a', 'b')
    setState({ selectedId: task('a').id })
    a.whenOpen()
    expect(getState().when).toMatchObject({ text: 'a' })
    a.whenApply(addDays(todayKey(), 3))
    expect(getState().when).toBeNull()
    expect(task('a').slot).toBe(addDays(todayKey(), 3))
    expect(getState().toasts.at(-1)?.text).toContain('a')
    a.undo()
    expect(task('a').slot).toBeNull()
  })

  it('gives a thought with subtasks\' open subtasks the day too', () => {
    dump('trip', 'flights', 'hotel')
    setState({ items: getState().items.map((i) => (i.text === 'trip' ? i : { ...i, parentId: task('trip').id })) })
    setState({ selectedId: task('trip').id })
    a.whenOpen()
    a.whenApply(todayKey())
    expect(getState().items.map((i) => i.slot)).toEqual([todayKey(), todayKey(), todayKey()])
  })

  it('in Plan it files the card and moves on, like 1–8', () => {
    dump('a', 'b')
    a.setMode('plan')
    a.whenOpen()
    a.whenApply(addDays(todayKey(), 2))
    expect(task('a').slot).toBe(addDays(todayKey(), 2))
    expect(a.planCurrent()?.text).toBe('b')
  })

  it('in Today, a task given another day leaves and the next one is selected', () => {
    dump('a', 'b')
    setState({ items: getState().items.map((i) => ({ ...i, slot: todayKey() })) })
    a.setMode('today')
    a.todayFocus(task('a').id)
    a.whenOpen()
    a.whenApply(addDays(todayKey(), 1))
    expect(todayList(getState().items, todayKey()).map((i) => i.text)).toEqual(['b'])
    expect(getState().todayCursor).toBe(task('b').id)
  })

  it('"no day" clears it', () => {
    dump('a')
    setState({ items: getState().items.map((i) => ({ ...i, slot: todayKey() })), selectedId: task('a').id })
    a.whenOpen()
    a.whenApply(null)
    expect(task('a').slot).toBeNull()
  })

  it('has nothing to do without a selection, in the Archive, or while a line is being typed', () => {
    a.whenOpen()
    expect(getState().when).toBeNull()
    dump('a')
    a.setMode('archive')
    a.whenOpen()
    expect(getState().when).toBeNull()
    a.setMode('today')
    a.todayAddOpen()
    a.whenOpen()
    expect(getState().when).toBeNull()
  })
})
