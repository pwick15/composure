import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, todayKey } from '../lib/dates'
import * as a from './actions'
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
