import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, todayKey } from '../lib/dates'
import { makeBackup, parseBackup } from '../lib/export'
import { itemsInColumn, settled, sortGroups, todayList, todayProgress, todaySessions, visibleInDump } from '../lib/selectors'
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
    a.deckFile('sort', 'admin')
    expect(quadrants().a).toBe('admin')
    expect(a.sortCurrent()?.text).toBe('b')
  })

  it('⌫ brings back the last filed thought, and re-filing returns to where you were', () => {
    dump('a', 'b', 'c')
    a.setMode('sort')
    a.deckFile('sort', 'do')
    a.deckFile('sort', 'quick') // oops: b was meant for Admin
    expect(a.sortCurrent()?.text).toBe('c')
    a.deckBack('sort')
    expect(a.sortCurrent()?.text).toBe('b')
    a.deckFile('sort', 'admin')
    expect(quadrants().b).toBe('admin')
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
    a.deckFile('sort', 'admin')
    expect(a.sortCurrent()?.text).toBe('b')
    a.undo()
    expect(quadrants().a).toBeNull()
    expect(a.sortCurrent()?.text).toBe('a')
    a.deckFile('sort', 'do')
    expect(a.sortCurrent()?.text).toBe('b')
  })

  it('↑/↓ walk unsorted, then Do, Admin, 2-minute, stopping at the ends', () => {
    dump('u', 'd', 's')
    setState({
      items: getState().items.map((i) => ({ ...i, quadrant: i.text === 'd' ? 'do' : i.text === 's' ? 'admin' : null })),
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
    a.deckFile('sort', 'admin')
    expect(quadrants().d).toBe('admin')
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
    a.deckFile('sort', 'admin')
    expect(a.sortCurrent()).toBeNull()
    a.deckBack('sort')
    expect(a.sortCurrent()?.text).toBe('b')
  })

  it('once everything is sorted, walks through the 2-minute tasks to do them now', () => {
    dump('a', 'b', 'c', 'd')
    a.setMode('sort')
    a.deckFile('sort', 'quick')
    expect(a.sortCurrent()?.text).toBe('b') // still sorting: the run waits
    a.deckFile('sort', 'do')
    a.deckFile('sort', 'quick')
    a.deckFile('sort', 'quick')
    expect(a.sortCurrent()?.text).toBe('a') // nothing left to sort: the first 2-minute task
    a.deckKeep('sort') // not now
    expect(a.sortCurrent()?.text).toBe('c')
    a.completeCurrent()
    expect(a.sortCurrent()?.text).toBe('d')
    a.deckFile('sort', 'admin') // not 2 minutes after all
    expect(quadrants().d).toBe('admin')
    expect(a.sortCurrent()?.text).toBe('a') // round to the start
    a.completeCurrent()
    expect(a.sortCurrent()).toBeNull()
  })

  it('⇧→ slides along the lanes and ⌘↑ takes a thought back to unsorted', () => {
    dump('a')
    a.setMode('sort')
    a.sortShift(0, 1)
    expect(quadrants().a).toBe('admin')
    a.sortShift(0, 1)
    a.sortShift(0, 1)
    expect(quadrants().a).toBe('quick')
    a.sortShift(-1, 0)
    expect(quadrants().a).toBeNull()
  })
})

describe('plan', () => {
  it('a number applies at once, in priority order', () => {
    dump('later thing', 'urgent thing')
    setState({
      items: getState().items.map((i) => ({ ...i, quadrant: i.text === 'urgent thing' ? 'do' : 'admin' })),
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

  it('skips 2-minute thoughts', () => {
    dump('reply to Sam')
    setState({ items: getState().items.map((i) => ({ ...i, quadrant: 'quick' as const })) })
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

  it('⌥M makes the selected task the main thing: one a day, again to unmark, ⌘Z undoes', () => {
    plannedToday('a', 'b')
    const main = () => getState().items.filter((i) => i.main === todayKey()).map((i) => i.text)
    a.todayMain()
    expect(main()).toEqual(['a'])
    a.todayFocus(getState().items.find((i) => i.text === 'b')!.id)
    a.todayMain()
    expect(main()).toEqual(['b'])
    expect(todayList(getState().items, todayKey()).map((i) => i.text)).toEqual(['b', 'a'])
    a.undo()
    expect(main()).toEqual(['a'])
    a.todayFocus(getState().items.find((i) => i.text === 'a')!.id)
    a.todayMain()
    expect(main()).toEqual([])
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

  it('⌥1–⌥6 in Sort set the time and leave the card where it is', () => {
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

  it('works in Dump too, on the selected thought, and a parent gives it to its open subtasks', () => {
    dump('a')
    setState({ selectedId: null })
    a.estimateStep(1)
    expect(minutesOf('a')).toBeNull() // nothing selected
    expect(getState().toasts.at(-1)?.text).toMatch(/Select a thought/)
    setState({ selectedId: getState().items[0].id })
    a.estimateStep(1)
    expect(minutesOf('a')).toBe(15)

    dump('trip', 'flights', 'hotel')
    const trip = getState().items.find((i) => i.text === 'trip')!
    setState({ items: getState().items.map((i) => (i.text === 'flights' || i.text === 'hotel' ? { ...i, parentId: trip.id } : i)), selectedId: trip.id })
    a.estimatePreset(4)
    expect([minutesOf('trip'), minutesOf('flights'), minutesOf('hotel')]).toEqual([null, 60, 60])
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

  it('an export carries the session names, and importing never renames a session you named', async () => {
    const before = world()
    const exported = makeBackup(before, { [todayKey()]: { 1: 'Deep work', 2: 'Admin' } })
    setState(initial, true)
    setState({ sessionNames: { [todayKey()]: { 2: 'Errands' } } })
    await importFile(file(exported))
    expect(getState().sessionNames[todayKey()]).toEqual({ 1: 'Deep work', 2: 'Errands' })
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

  it('picking the same lane or time again clears it', () => {
    a.setMode('today')
    a.todayAddOpen()
    a.todayAddQuadrant('admin')
    a.todayAddQuadrant('admin')
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
    a.todayAddQuadrant('admin')
    a.todayAddPaste('one', ['two', 'three'])
    expect(getState().items.map((i) => [i.text, i.quadrant])).toEqual([
      ['one', 'admin'],
      ['two', 'admin'],
      ['three', 'admin'],
    ])
    a.undo()
    expect(getState().items).toHaveLength(0)
  })

  it('new tasks land in the list in order: lane, then quickest first, and add to the day total', () => {
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
    a.todayAddArrow('right') // Do → Admin (a 2-minute task needs no day, so it isn't offered)
    a.todayAddArrow('right') // stops at the end of the row
    a.todayAddPick()
    expect(getState().todayAdd?.quadrant).toBe('admin')
    a.todayAddArrow('down')
    expect(getState().todayAdd?.cursor).toEqual({ row: 1, col: 0 })
    a.todayAddArrow('right')
    a.todayAddArrow('right')
    a.todayAddPick() // 5m → 15m → 30m
    expect(getState().todayAdd?.minutes).toBe(30)
    a.todayAddArrow('down') // no row below: stays put
    expect(getState().todayAdd?.cursor).toEqual({ row: 1, col: 2 })

    a.todayAddEnter('write report')
    expect(task('write report')).toMatchObject({ quadrant: 'admin', minutes: 30 })
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

  it('I asks what came up, 1–4 start a preset, and the clock on the task is held while away', () => {
    day(['a', 10], ['b', 20])
    a.pauseOpen()
    expect(getState().toasts.at(-1)?.text).toContain('Start a session first')
    a.sessionStart()
    passMinutes(4)
    a.pauseOpen()
    expect(getState().pausing).toBe(true)
    a.pausePreset(1) // bathroom, 5m
    expect(getState().pausing).toBe(false)
    expect(getState().run!.pause).toMatchObject({ label: 'Bathroom', minutes: 5 })
    passMinutes(30) // far past a's window, but the task clock is held
    expect(activeText()).toBe('a')
    expect(done('a')).toBe(false)
    a.pauseEnd()
    expect(getState().run!.pause).toBeUndefined()
    passMinutes(5) // a had 6 minutes left when it paused
    expect(activeText()).toBe('a')
    passMinutes(2)
    expect(activeText()).toBe('b')
  })

  it('a typed one ("call mum 15m") starts the same way, I or ↵ brings you back, and the finish time slides', () => {
    day(['a', 10])
    a.sessionStart()
    a.pauseOpen()
    a.pauseSubmit('call mum 15m')
    expect(getState().run!.pause).toMatchObject({ label: 'Call mum', minutes: 15 })
    a.pauseOpen() // I again
    expect(getState().run!.pause).toBeUndefined()
    a.pauseOpen()
    a.pauseSubmit('') // nothing typed: just closes
    expect(getState().pausing).toBe(false)
    expect(getState().run!.pause).toBeUndefined()
    a.pauseOpen()
    a.pauseSubmit('call')
    expect(getState().run!.pause).toMatchObject({ label: 'Call', minutes: null })
    passMinutes(7)
    a.sessionStart() // ↵
    expect(getState().run!.startedAt).toBe(T0 + 7 * MIN)
    passMinutes(9)
    expect(activeText()).toBe('a') // still has all ten minutes, from when you came back
  })

  it('tells you once when a timed one runs out, but keeps the task waiting', () => {
    day(['a', 30])
    a.sessionStart()
    a.pausePreset(2) // break, 10m
    passMinutes(9)
    expect(getState().run!.pause?.over).toBeUndefined()
    passMinutes(2)
    expect(getState().run!.pause?.over).toBe(true)
    expect(getState().toasts.at(-1)?.text).toContain('Break is up')
    const toasts = getState().toasts.length
    passMinutes(5)
    expect(getState().toasts.length).toBe(toasts) // only once
    expect(activeText()).toBe('a')
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

  it('⌘Z after ticking the active task off puts it back on the clock with the time it had left', () => {
    day(['a', 20], ['b', 30])
    a.sessionStart()
    passMinutes(5)
    a.todayToggle()
    expect(activeText()).toBe('b')
    passMinutes(1)
    a.undo()
    expect(done('a')).toBe(false)
    expect(activeText()).toBe('a')
    const run = getState().run!
    expect(run.startedAt + 20 * MIN - Date.now()).toBe(15 * MIN) // what it had left when it was ticked
    passMinutes(15)
    expect(activeText()).toBe('b')
  })

  it('catches up after the tab slept through several windows', () => {
    day(['a', 10], ['b', 10], ['c', 10])
    a.sessionStart()
    passMinutes(25)
    expect(activeText()).toBe('c')
    expect(getState().run!.startedAt).toBe(T0 + 20 * MIN)
  })

  it('⌥F carries on once time is up, and esc (sessionStop) ends it there', () => {
    day(['a', 10])
    a.sessionToggle()
    passMinutes(11)
    expect(getState().run?.phase).toBe('over')
    a.sessionToggle()
    expect(getState().run).toMatchObject({ phase: 'running', startedAt: Date.now() })
    passMinutes(11)
    a.sessionStop()
    expect(getState().run).toBeNull()
  })

  it('1–9 move the selected task to that session; one past the last starts a new one, further does nothing', () => {
    day(['a', 10], ['b', 10])
    a.todayFocus(getState().items.find((i) => i.text === 'b')!.id)
    a.todayToSession(2)
    expect(todaySessions(getState().items, todayKey()).map((g) => g.session)).toEqual([1, 2])
    a.todayToSession(4)
    expect(getState().items.find((i) => i.text === 'b')!.session).toBe(2)
    expect(getState().toasts.at(-1)?.text).toContain('Session 3 starts a new one')
    expect(a.todayCurrent()?.text).toBe('b') // the selection stays on what moved
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

describe('naming sessions', () => {
  const task = (text: string) => getState().items.find((i) => i.text === text)!

  it('a session keeps its name and number all day; an empty name goes back to "Session 2"', () => {
    dump('a', 'b')
    setState({ items: getState().items.map((i) => ({ ...i, slot: todayKey(), session: i.text === 'b' ? 2 : 1 })) })
    a.setMode('today')
    a.todayFocus(task('b').id)
    a.sessionRenameOpen()
    expect(getState().sessionRename).toEqual({ day: todayKey(), session: 2 })
    a.sessionRenameSave('  Deep work ')
    expect(a.sessionName(2)).toBe('Deep work')
    expect(a.sessionName(1)).toBe('Session 1')
    a.toggleDone(task('a').id) // the first session empties; the second keeps its name and number
    expect(todaySessions(getState().items, todayKey()).map((g) => a.sessionName(g.session))).toEqual(['Deep work'])
    a.sessionRenameAt(todayKey(), 2)
    a.sessionRenameSave('')
    expect(a.sessionName(2)).toBe('Session 2')
  })

  it('the thought sheet offers sessions by name, and names from past days are let go', () => {
    dump('a')
    setState({
      items: getState().items.map((i) => ({ ...i, slot: todayKey() })),
      sessionNames: { [addDays(todayKey(), -3)]: { 1: 'Old' } },
      selectedId: task('a').id,
    })
    a.sessionRenameAt(todayKey(), 1)
    a.sessionRenameSave('Morning')
    expect(Object.keys(getState().sessionNames)).toEqual([todayKey()])
    a.editCurrent()
    expect(a.sheetOptions(getState().sheet!, 'session').map((o) => o.label)).toEqual(['Morning', 'new'])
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

describe('when (⌘S)', () => {
  const task = (text: string) => getState().items.find((i) => i.text === text)!
  /** Picks a day on the sheet's day row, as clicking a reading does. */
  const giveDay = (slot: string | null) => a.sheetChoose('slot', { n: 0, label: String(slot), hint: '', change: { slot } })

  it('opens the sheet on the day, ready to type; a reading gives the thought that day, and ⌘Z undoes it', () => {
    dump('a', 'b')
    setState({ selectedId: task('a').id })
    a.whenOpen()
    expect(getState().sheet).toMatchObject({ ids: [task('a').id], row: 'slot', query: '', purpose: 'field' })
    a.sheetType('in 3 days')
    a.sheetEnter()
    expect(getState().sheet).toBeNull()
    expect(task('a').slot).toBe(addDays(todayKey(), 3))
    expect(getState().toasts.at(-1)?.text).toContain('"a"')
    a.undo()
    expect(task('a').slot).toBeNull()
  })

  it("gives a thought with subtasks' open subtasks the day too", () => {
    dump('trip', 'flights', 'hotel')
    setState({ items: getState().items.map((i) => (i.text === 'trip' ? i : { ...i, parentId: task('trip').id })) })
    setState({ selectedId: task('trip').id })
    a.whenOpen()
    giveDay(todayKey())
    expect(getState().items.map((i) => i.slot)).toEqual([null, todayKey(), todayKey()])
  })

  it('in Plan it files the card and moves on, like 1–8', () => {
    dump('a', 'b')
    a.setMode('plan')
    a.whenOpen()
    giveDay(addDays(todayKey(), 2))
    expect(task('a').slot).toBe(addDays(todayKey(), 2))
    expect(a.planCurrent()?.text).toBe('b')
  })

  it('in Today, a task given another day leaves and the next one is selected', () => {
    dump('a', 'b')
    setState({ items: getState().items.map((i) => ({ ...i, slot: todayKey() })) })
    a.setMode('today')
    a.todayFocus(task('a').id)
    a.whenOpen()
    giveDay(addDays(todayKey(), 1))
    expect(todayList(getState().items, todayKey()).map((i) => i.text)).toEqual(['b'])
    expect(getState().todayCursor).toBe(task('b').id)
  })

  it('"none" clears it', () => {
    dump('a')
    setState({ items: getState().items.map((i) => ({ ...i, slot: todayKey() })), selectedId: task('a').id })
    a.whenOpen()
    a.sheetType('none')
    a.sheetEnter()
    expect(task('a').slot).toBeNull()
  })

  it('has nothing to do without a selection, in the Archive, or while a line is being typed', () => {
    a.whenOpen()
    expect(getState().sheet).toBeNull()
    dump('a')
    a.setMode('archive')
    a.whenOpen()
    expect(getState().sheet).toBeNull()
    a.setMode('today')
    a.todayAddOpen()
    a.whenOpen()
    expect(getState().sheet).toBeNull()
  })
})

describe('dump: sorted and planned thoughts step aside', () => {
  const task = (text: string) => getState().items.find((i) => i.text === text)!
  const shown = () => treeOrder(visibleInDump(getState().items, getState().showPlanned)).map((i) => i.text)
  const done = { quadrant: 'do' as const, slot: todayKey(), minutes: 15 }
  const fill = (text: string, change: object) =>
    setState({ items: getState().items.map((i) => (i.text === text ? { ...i, ...change } : i)) })

  it('hides a thought once it has a priority, a day and a time, and shows it again on request', () => {
    dump('a', 'b', 'c')
    fill('b', done)
    expect(shown()).toEqual(['a', 'c'])
    a.togglePlanned()
    expect(shown()).toEqual(['a', 'b', 'c'])
    a.togglePlanned()
    expect(shown()).toEqual(['a', 'c'])
  })

  it('keeps a thought that still lacks any one of the three', () => {
    dump('no priority', 'no day', 'no time')
    fill('no priority', { slot: todayKey(), minutes: 15 })
    fill('no day', { quadrant: 'do', minutes: 15 })
    fill('no time', { quadrant: 'do', slot: todayKey() })
    expect(settled(getState().items).size).toBe(0)
  })

  it('treats a 2-minute thought as dealt with: it needs no day or time', () => {
    dump('a', 'b')
    fill('a', { quadrant: 'quick' })
    expect(shown()).toEqual(['b'])
  })

  it('hides a parent only when all its subtasks are dealt with', () => {
    dump('trip', 'flights', 'hotel')
    setState({ items: getState().items.map((i) => (i.text === 'trip' ? i : { ...i, parentId: task('trip').id })) })
    fill('flights', done)
    expect(shown()).toEqual(['trip', 'hotel'])
    fill('hotel', done)
    expect(shown()).toEqual([])
  })

  it('selection and moving skip what is hidden', () => {
    dump('a', 'b', 'c')
    fill('b', done)
    setState({ selectedId: task('a').id })
    a.dumpSelect(1)
    expect(getState().selectedId).toBe(task('c').id)
    a.dumpMove(-1) // swaps with a, not with the hidden b
    expect(texts()).toEqual(['c', 'b', 'a'])
    expect(shown()).toEqual(['c', 'a'])
  })

  it('closing a thought that search opened leaves the selection where it was', () => {
    dump('a', 'b', 'c')
    fill('a', done)
    setState({ selectedId: task('c').id })
    a.jumpTo(task('a').id)
    a.sheetClose()
    expect(getState().selectedId).toBe(task('c').id)
  })

  it('search opens a hidden thought right where you are, without unhiding everything', () => {
    dump('a')
    fill('a', done)
    a.setMode('sort')
    a.setMode('dump')
    expect(shown()).toEqual([])
    a.jumpTo(task('a').id)
    expect(getState().mode).toBe('dump')
    expect(getState().showPlanned).toBe(false)
    expect(getState().sheet).toMatchObject({ ids: [task('a').id], purpose: 'edit' })
  })

  it('search from Today opens a thought planned for another day on Today, not in Dump', () => {
    dump('a', 'b')
    fill('a', { ...done, slot: addDays(todayKey(), 3) })
    fill('b', done)
    a.setMode('today')
    a.jumpTo(task('a').id)
    expect(getState().mode).toBe('today')
    expect(getState().sheet?.ids).toEqual([task('a').id])
    a.jumpTo(task('b').id)
    expect(getState().todayCursor).toBe(task('b').id)
  })
})

describe('dump: → fills in what is missing, on the thought sheet', () => {
  const task = (text: string) => getState().items.find((i) => i.text === text)!
  const select = (text: string) => setState({ selectedId: task(text).id })
  const row = () => getState().sheet?.row

  it('asks for the lane, then day, then time, and the thought leaves Dump when done', () => {
    dump('a', 'b')
    select('a')
    a.fillOpen()
    expect(getState().sheet).toMatchObject({ ids: [task('a').id], row: 'quadrant', purpose: 'fill' })
    a.sheetPick(2) // Admin
    expect(task('a').quadrant).toBe('admin')
    expect(row()).toBe('slot')
    a.sheetPick(2) // tomorrow
    expect(task('a').slot).toBe(addDays(todayKey(), 1))
    expect(row()).toBe('minutes')
    a.sheetPick(3) // 30m
    expect(task('a').minutes).toBe(30)
    expect(getState().sheet).toBeNull()
    expect(getState().selectedId).toBe(task('b').id) // lands on the next thought
    expect(visibleInDump(getState().items, false).map((i) => i.text)).toEqual(['b'])
  })

  it('only asks for what is missing', () => {
    dump('a')
    setState({ items: getState().items.map((i) => ({ ...i, quadrant: 'do', slot: todayKey() })) })
    select('a')
    a.fillOpen()
    expect(row()).toBe('minutes')
  })

  it('has nothing to ask on a thought that is complete', () => {
    dump('a')
    setState({ items: getState().items.map((i) => ({ ...i, quadrant: 'do', slot: todayKey(), minutes: 5 })) })
    select('a')
    a.fillOpen()
    expect(getState().sheet).toBeNull()
    expect(getState().toasts.at(-1)?.text).toContain('Nothing missing')
  })

  it('2-minute is enough: no day or time is asked', () => {
    dump('a')
    select('a')
    a.fillOpen()
    a.sheetPick(3)
    expect(task('a').quadrant).toBe('quick')
    expect(getState().sheet).toBeNull()
  })

  it('↑/↓ move between rows, ←/→ and ↵ pick, and a pick moves on to what is still missing', () => {
    dump('a')
    select('a')
    a.fillOpen()
    a.sheetRow(1)
    expect(row()).toBe('slot')
    a.sheetPick(1)
    expect(task('a').slot).toBe(todayKey())
    expect(row()).toBe('minutes')
    a.sheetRow(-1)
    a.sheetRow(-1)
    expect(row()).toBe('quadrant') // the lane is still missing
    a.sheetCol(1)
    expect(getState().sheet?.col).toBe(1)
    a.sheetEnter() // Admin, which leaves only the time
    expect(task('a').quadrant).toBe('admin')
    expect(getState().sheet).toMatchObject({ row: 'minutes', col: 0 })
    a.sheetCol(-1)
    expect(getState().sheet?.col).toBe(0) // stays on the first option
    a.sheetClose()
    expect(getState().sheet).toBeNull()
  })

  it('one ⌘Z takes back a pick and brings a hidden thought back, selected', () => {
    dump('a')
    setState({ items: getState().items.map((i) => ({ ...i, quadrant: 'do', slot: todayKey() })) })
    select('a')
    a.fillOpen()
    a.sheetPick(3)
    expect(visibleInDump(getState().items, false)).toEqual([])
    a.undo()
    expect(task('a').minutes).toBeNull()
    expect(getState().selectedId).toBe(task('a').id)
    expect(visibleInDump(getState().items, false)).toHaveLength(1)
  })

  it('on a parent, fills in every subtask that lacks it, as one undo step', () => {
    dump('trip', 'flights', 'hotel')
    setState({ items: getState().items.map((i) => (i.text === 'trip' ? i : { ...i, parentId: task('trip').id })) })
    setState({ items: getState().items.map((i) => (i.text === 'hotel' ? { ...i, quadrant: 'admin' as const } : i)) })
    select('trip')
    a.fillOpen()
    a.sheetPick(1) // Do: only flights lacked a lane
    expect(task('flights').quadrant).toBe('do')
    expect(task('hotel').quadrant).toBe('admin')
    a.undo()
    expect(task('flights').quadrant).toBeNull()
    expect(task('hotel').quadrant).toBe('admin')
  })

  it('typing a day while filling in moves on to what is still missing', () => {
    dump('a')
    select('a')
    a.fillOpen()
    a.sheetType('fri') // a letter on the sheet starts typing a day
    expect(getState().sheet).toMatchObject({ row: 'slot', query: 'fri' })
    a.sheetEnter()
    expect(task('a').slot).not.toBeNull()
    expect(row()).toBe('minutes')
  })
})

describe('the thought sheet (↵, ⌘E)', () => {
  const task = (text: string) => getState().items.find((i) => i.text === text)!

  it('Dump: opens the selected thought, or says to select one', () => {
    dump('a')
    setState({ selectedId: null })
    a.editCurrent()
    expect(getState().sheet).toBeNull()
    expect(getState().toasts.at(-1)?.text).toContain('Select')
    setState({ selectedId: task('a').id })
    a.editCurrent()
    expect(getState().sheet).toMatchObject({ ids: [task('a').id], row: 'text', purpose: 'edit' })
    expect(a.sheetRows(getState().sheet!)).toEqual(['text', 'quadrant', 'slot', 'minutes'])
  })

  it('Sort and Plan: open the card, and saving the text changes only the text', () => {
    dump('a')
    a.setMode('sort')
    a.editCurrent()
    a.sheetSetText('a2')
    a.sheetClose()
    expect(task('a2')).toBeTruthy()
    a.setMode('plan')
    a.editCurrent()
    expect(getState().sheet?.ids).toEqual([task('a2').id])
  })

  it('stays open while you change priority, day and time, each applied at once', () => {
    dump('a')
    setState({ selectedId: task('a').id })
    a.editCurrent()
    a.sheetRow(1)
    a.sheetPick(1)
    a.sheetRow(1)
    a.sheetPick(1)
    a.sheetRow(1)
    a.sheetPick(4)
    expect(task('a')).toMatchObject({ quadrant: 'do', slot: todayKey(), minutes: 60 })
    expect(getState().sheet?.receipt).toBe('time → 1h')
    a.undo()
    expect(task('a').minutes).toBeNull()
    expect(getState().sheet).not.toBeNull() // ⌘Z keeps it open
  })

  it('0 clears a row, and - / = nudge the time', () => {
    dump('a')
    setState({ items: getState().items.map((i) => ({ ...i, quadrant: 'do' as const, minutes: 30 })), selectedId: task('a').id })
    a.editCurrent()
    a.sheetRow(1)
    a.sheetPick(0)
    expect(task('a').quadrant).toBeNull()
    a.sheetNudge(1)
    expect(task('a').minutes).toBe(45)
    expect(getState().sheet?.row).toBe('minutes')
  })

  it('Today: edits several picked tasks at once, and offers the day’s sessions', () => {
    dump('a', 'b', 'c')
    setState({ items: getState().items.map((i) => ({ ...i, quadrant: 'do' as const, slot: todayKey(), minutes: 15, session: i.text === 'c' ? 2 : 1 })) })
    a.setMode('today')
    a.todayFocus(task('a').id)
    a.pickExtend(1)
    a.editCurrent()
    const sheet = getState().sheet!
    expect(sheet.ids).toEqual([task('a').id, task('b').id])
    expect(a.sheetRows(sheet)).toEqual(['quadrant', 'slot', 'minutes', 'session'])
    expect(a.sheetOptions(sheet, 'session').map((o) => o.n)).toEqual([1, 2, 3]) // 3 starts a new one
    a.sheetGo('session')
    a.sheetPick(2)
    expect(todaySessions(getState().items, todayKey()).map((g) => g.items.map((i) => i.text))).toEqual([['a', 'b', 'c']])
  })

  it('Archive: a finished thought only has its text', () => {
    dump('a')
    a.toggleDone(task('a').id)
    a.setMode('archive')
    a.editCurrent()
    expect(a.sheetRows(getState().sheet!)).toEqual(['text'])
  })

  it('⌘K on the sheet ticks off what it shows', () => {
    dump('a', 'b')
    setState({ selectedId: task('a').id })
    a.editCurrent()
    a.sheetDone()
    expect(getState().sheet).toBeNull()
    expect(task('a').done).toBe(true)
  })

  it('says so when there is nothing selected', () => {
    a.setMode('today')
    a.editCurrent()
    expect(getState().sheet).toBeNull()
    expect(getState().toasts.at(-1)?.text).toContain('Nothing selected')
  })
})

describe('start the sorting over', () => {
  const task = (text: string) => getState().items.find((i) => i.text === text)!

  it('clears priority, day, time and session on everything open, and ⌘Z puts it all back', () => {
    dump('a', 'b', 'old')
    setState({
      items: getState().items.map((i) => ({ ...i, quadrant: 'do' as const, slot: todayKey(), minutes: 30, session: 2 })),
    })
    a.toggleDone(task('old').id)
    a.unorganise()
    for (const t of ['a', 'b']) expect(task(t)).toMatchObject({ quadrant: null, slot: null, minutes: null, session: 1, text: t })
    expect(task('old')).toMatchObject({ done: true, quadrant: 'do', minutes: 30 }) // the archive is left alone
    expect(getState().toasts.at(-1)?.text).toContain('2 thoughts')
    a.undo()
    expect(task('a')).toMatchObject({ quadrant: 'do', slot: todayKey(), minutes: 30, session: 2 })
  })

  it('subtasks lose theirs too, but stay under their parent', () => {
    dump('trip', 'flights')
    setState({ items: getState().items.map((i) => (i.text === 'flights' ? { ...i, parentId: task('trip').id, quadrant: 'do' as const } : i)) })
    a.unorganise()
    expect(task('flights')).toMatchObject({ quadrant: null, parentId: task('trip').id })
  })

  it('says so when there is nothing to clear, and changes nothing', () => {
    dump('a')
    a.unorganise()
    expect(getState().toasts.at(-1)?.text).toContain('Nothing is sorted')
    expect(getState().past.length).toBe(1) // only the dump itself
  })
})

describe('order by hand (⌥↑ ⌥↓)', () => {
  const task = (text: string) => getState().items.find((i) => i.text === text)!
  const withMinutes = (m: Record<string, number>, extra: object = {}) =>
    setState({ items: getState().items.map((i) => ({ ...i, quadrant: 'do' as const, minutes: m[i.text] ?? null, ...extra })) })
  const doList = () => sortGroupsDo().map((i) => i.text)
  const sortGroupsDo = () => sortGroups(getState().items)[1]

  it('Sort: moves a thought past the quickest-first order, and the rest keep the order they showed', () => {
    dump('long', 'short', 'mid')
    withMinutes({ long: 60, short: 5, mid: 30 })
    expect(doList()).toEqual(['short', 'mid', 'long']) // automatic
    a.setMode('sort')
    a.deckFocus('sort', task('short').id)
    a.orderMove(1)
    expect(doList()).toEqual(['mid', 'short', 'long'])
    a.orderMove(1)
    a.orderMove(1) // already last: stays
    expect(doList()).toEqual(['mid', 'long', 'short'])
    expect(getState().decks.sort.cursor).toBe(task('short').id) // still the selected one
    a.undo()
    expect(doList()).toEqual(['mid', 'short', 'long'])
  })

  it('a thought added later joins after the ones placed by hand', () => {
    dump('long', 'mid')
    withMinutes({ long: 60, mid: 30 })
    a.setMode('sort')
    a.deckFocus('sort', task('mid').id)
    a.orderMove(1)
    expect(doList()).toEqual(['long', 'mid'])
    dump('tiny')
    setState({ items: getState().items.map((i) => (i.text === 'tiny' ? { ...i, quadrant: 'do' as const, minutes: 1 } : i)) })
    expect(doList()).toEqual(['long', 'mid', 'tiny'])
  })

  it('files into another quadrant forget the place from the old one', () => {
    dump('a', 'b')
    withMinutes({ a: 10, b: 20 })
    a.setMode('sort')
    a.deckFocus('sort', task('a').id)
    a.orderMove(1)
    expect(task('a').manual).toEqual({ sort: 2 })
    a.deckFile('sort', 'admin')
    expect(task('a').manual).toBeUndefined()
  })

  it('Plan: reorders within a day, and Today within a session, each on its own', () => {
    dump('long', 'short')
    withMinutes({ long: 60, short: 5 }, { slot: todayKey() })
    a.setMode('plan')
    a.deckFocus('plan', task('short').id)
    a.orderMove(1)
    expect(itemsInColumn(getState().items, todayKey(), todayKey()).map((i) => i.text)).toEqual(['long', 'short'])
    expect(todayList(getState().items, todayKey()).map((i) => i.text)).toEqual(['short', 'long']) // Today is its own list
    a.setMode('today')
    a.todayFocus(task('long').id)
    a.orderMove(-1)
    expect(todayList(getState().items, todayKey()).map((i) => i.text)).toEqual(['long', 'short'])
  })

  it('Plan: in a day split into sessions, a thought moves within its own session', () => {
    dump('a', 'b', 'c')
    withMinutes({ a: 5, b: 10, c: 15 }, { slot: todayKey() })
    setState({ items: getState().items.map((i) => (i.text === 'c' ? { ...i, session: 2 } : i)) })
    a.setMode('plan')
    a.deckFocus('plan', task('b').id)
    a.orderMove(1) // b is the last of session 1: nothing changes, not even the order kept behind the scenes
    expect(itemsInColumn(getState().items, todayKey(), todayKey()).map((i) => i.text)).toEqual(['a', 'b', 'c'])
    expect(getState().items.some((i) => i.manual)).toBe(false)
    a.orderMove(-1)
    expect(itemsInColumn(getState().items, todayKey(), todayKey()).map((i) => i.text)).toEqual(['b', 'a', 'c'])
  })

  it('Today: moves within its session and never into another', () => {
    dump('a', 'b', 'c')
    withMinutes({ a: 5, b: 10, c: 15 }, { slot: todayKey() })
    setState({ items: getState().items.map((i) => (i.text === 'c' ? { ...i, session: 2 } : i)) })
    a.setMode('today')
    a.todayFocus(task('b').id)
    a.orderMove(1) // b is last in session 1; c is in session 2
    expect(todayList(getState().items, todayKey()).map((i) => i.text)).toEqual(['a', 'b', 'c'])
    a.orderMove(-1)
    expect(todayList(getState().items, todayKey()).map((i) => i.text)).toEqual(['b', 'a', 'c'])
    expect(getState().todayCursor).toBe(task('b').id)
  })

  it('says why the unsorted queue does not move, and can go back to automatic', () => {
    dump('a')
    a.setMode('sort')
    a.orderMove(1)
    expect(getState().toasts.at(-1)?.text).toContain('Dump order')
    a.orderAuto()
    expect(getState().toasts.at(-1)?.text).toContain('Already')
    dump('x', 'y')
    withMinutes({ a: 1, x: 10, y: 20 })
    a.deckFocus('sort', task('x').id)
    a.orderMove(1)
    expect(task('x').manual).toBeDefined()
    a.orderAuto()
    expect(getState().items.some((i) => i.manual)).toBe(false)
    expect(doList()).toEqual(['a', 'x', 'y'])
  })

  it('starting the sorting over clears the places too, and a backup keeps them', () => {
    dump('a', 'b')
    withMinutes({ a: 1, b: 2 })
    a.setMode('sort')
    a.deckFocus('sort', task('a').id)
    a.orderMove(1)
    expect(parseBackup(makeBackup(getState().items)).find((i) => i.text === 'a')?.manual).toEqual({ sort: 2 })
    a.unorganise()
    expect(getState().items.some((i) => i.manual)).toBe(false)
  })
})

describe('picking several (⇧↑ ⇧↓)', () => {
  const task = (text: string) => getState().items.find((i) => i.text === text)!
  const ids = (...t: string[]) => t.map((x) => task(x).id)
  const planned = (m: Record<string, number>, extra: object = {}) =>
    setState({ items: getState().items.map((i) => ({ ...i, quadrant: 'do' as const, slot: todayKey(), minutes: m[i.text] ?? null, ...extra })) })

  it('Dump: ⇧↓ picks several, ⌘K ticks them all off as one undo step, and a parent covers its subtasks', () => {
    dump('a', 'b', 'c')
    setState({ selectedId: task('a').id })
    a.pickExtend(1)
    expect(getState().picked?.ids).toEqual(ids('a', 'b'))
    expect(getState().selectedId).toBe(task('b').id)
    a.completeCurrent()
    expect(getState().items.filter((i) => i.done).map((i) => i.text)).toEqual(['a', 'b'])
    expect(getState().selectedId).toBe(task('c').id)
    a.undo()
    expect(getState().items.filter((i) => i.done)).toEqual([])

    setState({ items: getState().items.map((i) => (i.text === 'c' ? { ...i, parentId: task('b').id } : i)), selectedId: task('b').id })
    a.pickExtend(1) // the parent and its subtask
    a.deleteCurrent()
    expect(texts()).toEqual(['a'])
  })

  it('Dump: ↑/↓ and esc go back to one', () => {
    dump('a', 'b', 'c')
    setState({ selectedId: task('a').id })
    a.pickExtend(1)
    a.dumpSelect(1)
    expect(getState().picked).toBeNull()
    a.pickExtend(-1)
    a.dumpEscape()
    expect(getState().picked).toBeNull()
  })

  it('Today: ⇧↓ highlights a run, ⇧↑ shrinks it, and moving normally goes back to one', () => {
    dump('a', 'b', 'c', 'd')
    planned({ a: 5, b: 10, c: 15, d: 20 })
    a.setMode('today')
    a.todayFocus(task('a').id)
    a.pickExtend(1)
    a.pickExtend(1)
    expect(getState().picked?.ids).toEqual(ids('a', 'b', 'c'))
    expect(getState().todayCursor).toBe(task('c').id)
    a.pickExtend(-1)
    expect(getState().picked?.ids).toEqual(ids('a', 'b'))
    a.pickExtend(-1)
    expect(getState().picked).toBeNull() // back to one
    a.pickExtend(1)
    a.todayMove(1)
    expect(getState().picked).toBeNull()
  })

  it('extends upwards from the start too, and stops at the ends', () => {
    dump('a', 'b', 'c')
    planned({ a: 5, b: 10, c: 15 })
    a.setMode('today')
    a.todayFocus(task('c').id)
    a.pickExtend(-1)
    a.pickExtend(-1)
    a.pickExtend(-1)
    expect(getState().picked?.ids).toEqual(ids('a', 'b', 'c'))
  })

  it('Today: ⇧→ moves every picked task to the next session, done and delete act on all', () => {
    dump('a', 'b', 'c', 'd')
    planned({ a: 5, b: 10, c: 15, d: 20 })
    a.setMode('today')
    a.todayFocus(task('a').id)
    a.pickExtend(1)
    a.todayMoveSession(1)
    expect(['a', 'b', 'c', 'd'].map((t) => task(t).session)).toEqual([2, 2, 1, 1])
    expect(getState().picked?.ids).toEqual(ids('a', 'b')) // still picked, to keep going
    a.todayMoveSession(-1)
    expect(['a', 'b', 'c', 'd'].map((t) => task(t).session)).toEqual([1, 1, 1, 1])
    a.todayToggle()
    expect(getState().items.filter((i) => i.done).map((i) => i.text)).toEqual(['a', 'b'])
    expect(getState().todayCursor).toBe(task('c').id) // lands on the next one left
    expect(getState().picked).toBeNull()
    a.undo()
    expect(getState().items.some((i) => i.done)).toBe(false) // one undo for both
  })

  it('Today: picking everything in a session does not start a new one for it', () => {
    dump('a', 'b')
    planned({ a: 5, b: 10 })
    a.setMode('today')
    a.todayFocus(task('a').id)
    a.pickExtend(1)
    a.todayMoveSession(1)
    expect(task('a').session).toBe(1)
  })

  it('Today: ⌘⌫ deletes all picked, T sends them all to tomorrow', () => {
    dump('a', 'b', 'c')
    planned({ a: 5, b: 10, c: 15 })
    a.setMode('today')
    a.todayFocus(task('a').id)
    a.pickExtend(1)
    a.todayDefer()
    expect(task('a').slot).toBe(addDays(todayKey(), 1))
    expect(task('b').slot).toBe(addDays(todayKey(), 1))
    expect(task('c').slot).toBe(todayKey())
    expect(getState().todayCursor).toBe(task('c').id)
    a.todayFocus(task('c').id)
    a.pickExtend(-1) // nothing above c in today now
    expect(getState().picked).toBeNull()
  })

  it('Plan: a day key files every picked thought, and ⇧→ slides them a day later', () => {
    dump('a', 'b', 'c')
    setState({ items: getState().items.map((i) => ({ ...i, quadrant: 'do' as const })) })
    a.setMode('plan')
    a.deckFocus('plan', task('a').id)
    a.pickExtend(1)
    expect(getState().picked?.ids).toEqual(ids('a', 'b'))
    a.planFileDay(2)
    expect(task('a').slot).toBe(addDays(todayKey(), 1))
    expect(task('b').slot).toBe(addDays(todayKey(), 1))
    expect(task('c').slot).toBeNull()
    expect(a.planCurrent()?.text).toBe('c') // on to the next waiting one
    expect(getState().picked).toBeNull()
    a.deckFocus('plan', task('a').id)
    a.pickExtend(1)
    a.planShift(1)
    expect(task('a').slot).toBe(addDays(todayKey(), 2))
    expect(task('b').slot).toBe(addDays(todayKey(), 2))
  })

  it('Sort: filing, shifting and times apply to all picked; ⌘↑ takes them back to unsorted', () => {
    dump('a', 'b', 'c')
    a.setMode('sort')
    a.pickExtend(1)
    expect(getState().picked?.ids).toEqual(ids('a', 'b'))
    a.deckFile('sort', 'admin')
    expect(task('a').quadrant).toBe('admin')
    expect(task('b').quadrant).toBe('admin')
    expect(task('c').quadrant).toBeNull()
    a.deckFocus('sort', task('a').id)
    a.pickExtend(1)
    a.sortShift(0, -1)
    expect([task('a').quadrant, task('b').quadrant]).toEqual(['do', 'do'])
    a.sortShift(-1, 0)
    expect([task('a').quadrant, task('b').quadrant]).toEqual([null, null])
    a.estimatePreset(3)
    expect([task('a').minutes, task('b').minutes]).toEqual([30, 30])
    a.estimateStep(1) // each steps from its own
    expect([task('a').minutes, task('b').minutes]).toEqual([45, 45])
    expect(task('c').minutes).toBeNull()
  })

  it('⌘S gives them all the day, and ⌘K / ⌘⌫ clear them from Sort', () => {
    dump('a', 'b', 'c')
    planned({})
    a.setMode('sort')
    a.deckFocus('sort', task('a').id)
    a.pickExtend(1)
    a.whenOpen()
    expect(getState().sheet?.ids).toEqual([task('a').id, task('b').id])
    a.sheetType('in 3 days')
    a.sheetEnter()
    expect([task('a').slot, task('b').slot, task('c').slot]).toEqual([addDays(todayKey(), 3), addDays(todayKey(), 3), todayKey()])
    expect(getState().picked).toBeNull()
    a.deckFocus('sort', task('a').id)
    a.pickExtend(1)
    a.completeCurrent()
    expect(getState().items.filter((i) => i.done).map((i) => i.text)).toEqual(['a', 'b'])
    a.deckFocus('sort', task('c').id)
    a.deleteCurrent()
    expect(texts()).toEqual(['a', 'b'])
  })

  it('esc and changing screen drop the picking', () => {
    dump('a', 'b')
    planned({ a: 5, b: 5 })
    a.setMode('today')
    a.pickExtend(1)
    expect(getState().picked).not.toBeNull()
    a.pickClear()
    expect(getState().picked).toBeNull()
    a.pickExtend(1)
    a.setMode('plan')
    expect(getState().picked).toBeNull()
  })
})

describe('sessions mode and the send back to Things', () => {
  const sessionsOn = () => a.toggleWorkMode()

  it('puts a pasted list straight into today, with no lane or day to choose', () => {
    sessionsOn()
    expect(getState()).toMatchObject({ workMode: 'sessions', mode: 'today' })
    a.pasteLines(['Update my MacBook OS', 'Admin'])
    expect(getState().items.map((i) => [i.text, i.quadrant, i.slot, i.session])).toEqual([
      ['Update my MacBook OS', null, todayKey(), 1],
      ['Admin', null, todayKey(), 1],
    ])
    expect(todayList(getState().items, todayKey())).toHaveLength(2)
    a.undo()
    expect(getState().items).toHaveLength(0)
  })

  it('keeps to Today, and the full app comes back with nothing lost', () => {
    dump('kept')
    sessionsOn()
    a.setMode('sort')
    a.cycleMode(-1)
    expect(getState().mode).toBe('today')
    sessionsOn()
    expect(getState().workMode).toBe('full')
    a.setMode('sort')
    expect(getState().mode).toBe('sort')
    expect(texts()).toEqual(['kept'])
  })

  const sentTasks = () => {
    sessionsOn()
    a.pasteLines(['one', 'two', 'three'])
    const [one, two, three] = getState().items
    a.todayTick(one.id)
    return { one, two, three }
  }

  it('keeps the tasks until you say they arrived, then clears finished and leftover ones together', () => {
    const { one, two, three } = sentTasks()
    a.outboxSet([one.id, two.id], 1)
    expect(texts()).toEqual(['one', 'two', 'three'])
    a.outboxConfirm()
    expect(texts()).toEqual(['three'])
    expect(getState().outbox).toBeNull()
    a.undo()
    expect(texts()).toEqual(['one', 'two', 'three'])
    expect(three.done).toBe(false)
  })

  it('keeps everything when they did not arrive', () => {
    const { one, two, three } = sentTasks()
    a.outboxSet([one.id, two.id, three.id], 2)
    a.outboxCancel()
    expect(getState().outbox).toBeNull()
    expect(texts()).toEqual(['one', 'two', 'three'])
  })

  it('drops a parent once all its subtasks are cleared', () => {
    dump('Plan trip', 'flights', 'hotel')
    const [parent, flights, hotel] = getState().items
    a.indentItem(flights.id)
    a.indentItem(hotel.id)
    a.outboxSet([flights.id], 1)
    a.outboxConfirm()
    expect(texts()).toEqual(['Plan trip', 'hotel'])
    a.outboxSet([hotel.id], 1)
    a.outboxConfirm()
    expect(texts()).toEqual([])
    expect(parent.text).toBe('Plan trip')
  })
})
