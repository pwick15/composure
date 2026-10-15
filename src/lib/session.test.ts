import { describe, expect, it } from 'vitest'
import { iconLabel } from './favicon'
import { advance, clock, effMinutes, leftovers, remainingMs, startRun, type Run } from './session'
import type { Item } from './types'

const MIN = 60_000
const T0 = 1_000_000

const task = (id: string, minutes: number | null): Item => ({
  id,
  text: id,
  createdAt: 0,
  quadrant: 'do',
  slot: '2026-10-13',
  done: false,
  doneAt: null,
  parentId: null,
  minutes,
  session: 1,
})

const items = [task('a', 10), task('b', 20), task('c', 5)]
const all = new Set(['a', 'b', 'c'])
const fresh = () => startRun(1, items, T0) as Run

describe('work session timing', () => {
  it('starts on the first task, and has nothing to start without tasks', () => {
    expect(fresh()).toMatchObject({ queue: ['a', 'b', 'c'], index: 0, startedAt: T0, phase: 'running' })
    expect(startRun(1, [], T0)).toBeNull()
  })

  it('does nothing while the window is open (same object back)', () => {
    const run = fresh()
    const out = advance(run, items, all, T0 + 9 * MIN)
    expect(out.run).toBe(run)
    expect(out.timedOut).toEqual([])
  })

  it('hands over exactly when the window closes, and the next window starts there', () => {
    const out = advance(fresh(), items, all, T0 + 10 * MIN + 5000)
    expect(out.run).toMatchObject({ index: 1, startedAt: T0 + 10 * MIN })
    expect(out.timedOut).toEqual(['a'])
  })

  it('catches up through several windows at once', () => {
    const out = advance(fresh(), items, all, T0 + 32 * MIN)
    expect(out.run).toMatchObject({ index: 2, startedAt: T0 + 30 * MIN, phase: 'running' })
    expect(out.timedOut).toEqual(['a', 'b'])
  })

  it('is over once the last window closes, with the unfinished ones left to you', () => {
    const out = advance(fresh(), items, all, T0 + 36 * MIN)
    expect(out.run.phase).toBe('over')
    expect(out.timedOut).toEqual(['a', 'b', 'c'])
    expect(leftovers(out.run, new Set(['b']))).toEqual(['b'])
  })

  it('skips a task that was ticked off, starting its successor now (no alarm for it)', () => {
    const open = new Set(['b', 'c'])
    const out = advance(fresh(), items, open, T0 + 3 * MIN)
    expect(out.run).toMatchObject({ index: 1, startedAt: T0 + 3 * MIN })
    expect(out.timedOut).toEqual([])
  })

  it('is over, with nothing left, when everything was ticked off', () => {
    const out = advance(fresh(), items, new Set(), T0 + MIN)
    expect(out.run.phase).toBe('over')
    expect(leftovers(out.run, new Set())).toEqual([])
  })

  it('reads a new estimate straight away: more time extends the window, less closes it', () => {
    const longer = [task('a', 30), items[1], items[2]]
    expect(advance(fresh(), longer, all, T0 + 20 * MIN).run.index).toBe(0)
    const shorter = [task('a', 5), items[1], items[2]]
    expect(advance(fresh(), shorter, all, T0 + 6 * MIN).run.index).toBe(1)
  })

  it('counts the whole session down: the window in progress plus every window after it', () => {
    const run = fresh()
    expect(remainingMs(run, items, all, T0)).toBe(35 * MIN)
    expect(remainingMs(run, items, all, T0 + 4 * MIN)).toBe(31 * MIN)
    expect(remainingMs(run, items, new Set(['a', 'c']), T0)).toBe(15 * MIN) // b was ticked off
    expect(remainingMs({ ...run, phase: 'over' }, items, all, T0)).toBe(0)
  })

  it('a task with no estimate gets a default window', () => {
    expect(effMinutes(task('x', null))).toBe(25)
    expect(effMinutes(task('x', 7))).toBe(7)
  })

  it('writes clocks as mm:ss, with hours when there are some', () => {
    expect([0, 754_000, 3_725_000, 59_001].map(clock)).toEqual(['00:00', '12:34', '1:02:05', '01:00'])
  })
})

describe('tab icon', () => {
  it('writes minutes left, rounding up so it never says 0 early, and hours past 99 minutes', () => {
    expect([59_000, 60_000, 61_000, 25 * MIN, 99 * MIN, 100 * MIN, 120 * MIN, 150 * MIN, 0].map(iconLabel)).toEqual([
      '1',
      '1',
      '2',
      '25',
      '99',
      '2h',
      '2h',
      '3h',
      '0',
    ])
  })
})
