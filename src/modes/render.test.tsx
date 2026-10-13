import type { ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { todayKey } from '../lib/dates'
import type { Item } from '../lib/types'
import { getState, setState, useStore } from '../state/store'
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

const base: Item = { id: '', text: '', createdAt: 0, quadrant: null, slot: null, done: false, parentId: null, minutes: null }
const today = todayKey()

/** A parent with two subtasks that are filed and planned, and a plain thought. */
function seed() {
  load([
      { ...base, id: 'p', text: 'Plan trip', quadrant: 'schedule', slot: today },
      { ...base, id: 'f', text: 'book flights', parentId: 'p', quadrant: 'do', slot: today, minutes: 30 },
      { ...base, id: 'h', text: 'book hotel', parentId: 'p', quadrant: 'do', slot: today, minutes: 90, done: true },
      { ...base, id: 'r', text: 'pay rent', quadrant: 'do', slot: today },
  ])
}

describe('screens', () => {
  it('Dump shows subtasks as a tree with progress and the parent total', () => {
    seed()
    const html = render(<DumpMode />)
    expect(html).toContain('├')
    expect(html).toContain('└')
    expect(html).toContain('1/2')
    expect(html).toContain('~2h') // 30m + 90m
  })

  it('Sort puts the subtasks in quadrants, not the parent, each pointing back at it', () => {
    seed()
    const html = render(<SortMode />)
    expect(html).toContain('book flights')
    expect(html.match(/class="chip"/g)).toHaveLength(3) // not four: the parent is a label, not a task
    expect(html).toContain('↳</span> Plan trip') // shown only as the reference on its subtasks
    expect(html).toContain('2h') // the Do quadrant's total: 30m + 90m
    expect(html).toContain('3/3') // all three actionable thoughts are sorted
  })

  it('Plan counts only the actionable thoughts and totals each day', () => {
    seed()
    expect(getState().items).toHaveLength(4)
    const html = render(<PlanMode />)
    expect(html).toContain('Your week is planned')
    expect(html).toContain('2h') // today's total
  })

  it('Today shows the add line with its quadrant and time chips, and marks what is picked', () => {
    seed()
    Object.assign(snapshot, { todayAdd: { quadrant: 'do', minutes: 30, cursor: { row: 1, col: 2 } } })
    setState({ todayAdd: { quadrant: 'do', minutes: 30, cursor: { row: 1, col: 2 } } })
    const html = render(<TodayMode />)
    expect(html).toContain('Add a task for today')
    expect(html).toContain('today-add__attrs')
    expect(html.match(/class="attr"/g)).toHaveLength(9) // Do, Schedule, Delegate and six times
    expect(html.match(/data-on="true"/g)).toHaveLength(2)
    expect(html.match(/data-cursor="true"/g)).toHaveLength(1) // the arrow keys' place: 30m
  })

  it('Today lists the subtasks with times and adds the day up', () => {
    seed()
    const html = render(<TodayMode />)
    expect(html).toContain('book flights')
    expect(html).toContain('~30m')
    expect(html).toContain('2h</b> planned')
    expect(html).toContain('30m</b> left')
    expect(html).toContain('1 without a time')
    expect(html).not.toMatch(/row__text">Plan trip/)
  })
})
