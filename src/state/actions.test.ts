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

describe('sort', () => {
  it('pick, confirm, and move on to the next unsorted item', () => {
    dump('a', 'b', 'c')
    a.setMode('sort')
    expect(a.sortCurrent()?.text).toBe('a')
    a.sortPick('schedule')
    expect(getState().items[0].quadrant).toBeNull() // nothing changes until Enter
    a.sortConfirm()
    expect(getState().items[0].quadrant).toBe('schedule')
    expect(a.sortCurrent()?.text).toBe('b')
  })

  it('Enter without a choice shakes instead of moving on', () => {
    dump('a')
    a.setMode('sort')
    const shake = getState().shake
    a.sortConfirm()
    expect(getState().shake).toBe(shake + 1)
    expect(a.sortCurrent()?.text).toBe('a')
  })

  it('arrows walk the 2x2 grid and stop at the edges', () => {
    dump('a')
    a.setMode('sort')
    a.sortNudge(0, 1) // no target yet: starts at Do
    expect(getState().sortPending?.value).toBe('do')
    a.sortNudge(0, 1)
    expect(getState().sortPending?.value).toBe('schedule')
    a.sortNudge(1, 0)
    expect(getState().sortPending?.value).toBe('drop')
    a.sortNudge(0, 1)
    expect(getState().sortPending?.value).toBe('drop')
  })

  it('ends with no current item once everything is sorted', () => {
    dump('a', 'b')
    a.setMode('sort')
    a.sortPick('do')
    a.sortConfirm()
    a.sortPick('drop')
    a.sortConfirm()
    expect(a.sortCurrent()).toBeNull()
    a.sortStep(1) // J revisits
    expect(a.sortCurrent()?.text).toBe('a')
  })
})

describe('plan', () => {
  it('slots by number and confirms in priority order', () => {
    dump('later thing', 'urgent thing')
    setState({
      items: getState().items.map((i) => ({ ...i, quadrant: i.text === 'urgent thing' ? 'do' : 'schedule' })),
    })
    a.setMode('plan')
    expect(a.planCurrent()?.text).toBe('urgent thing')
    a.planPickIndex(2)
    a.planConfirm()
    const urgent = getState().items.find((i) => i.text === 'urgent thing')!
    expect(urgent.slot).toBe(addDays(todayKey(), 1))
    expect(a.planCurrent()?.text).toBe('later thing')
  })

  it('arrows move between days and clamp at Later', () => {
    dump('x')
    a.setMode('plan')
    a.planNudge(1)
    expect(getState().planPending?.value).toBe(todayKey())
    for (let i = 0; i < 10; i++) a.planNudge(1)
    expect(getState().planPending?.value).toBe('later')
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
