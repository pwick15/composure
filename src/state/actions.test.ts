import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, todayKey } from '../lib/dates'
import { makeBackup } from '../lib/export'
import { todayList } from '../lib/selectors'
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

  it('F starts a focus block, F again stops it, finishing a task ends it', () => {
    plannedToday('a')
    a.focusToggle()
    expect(getState().focus?.id).toBe(getState().items[0].id)
    a.focusToggle()
    expect(getState().focus).toBeNull()
    a.focusToggle()
    a.todayToggle()
    expect(getState().focus).toBeNull()
  })

  it('⌥→ steps through screens and stops at the ends', () => {
    a.setMode('plan')
    a.cycleMode(1)
    expect(getState().mode).toBe('today')
    a.cycleMode(1)
    expect(getState().mode).toBe('today')
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

  it('F focuses for as long as the task was estimated, 25 minutes when it was not', () => {
    plannedToday('a', 'b')
    setState({ items: getState().items.map((i) => (i.text === 'a' ? { ...i, minutes: 90 } : i)) })
    a.focusToggle()
    expect(getState().focus).toMatchObject({ minutes: 90 })
    a.focusStop()
    a.todayMove(1)
    a.focusToggle()
    expect(getState().focus).toMatchObject({ minutes: 25 })
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
