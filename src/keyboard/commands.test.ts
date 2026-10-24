import { describe, expect, it } from 'vitest'
import type { Mode } from '../lib/types'
import { findCommand } from './commands'
import { setState } from '../state/store'
import { isMac } from './keys'

const key = (init: Partial<KeyboardEvent>) =>
  ({ key: '', code: '', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...init }) as KeyboardEvent

const mod = isMac ? { metaKey: true } : { ctrlKey: true }
const MODES: Mode[] = ['dump', 'sort', 'plan', 'today', 'archive']
const LISTS = ['dump', 'sort', 'plan', 'today'] as const
const letter = (k: string, extra: Partial<KeyboardEvent> = {}) => key({ key: k, code: `Key${k.toUpperCase()}`, ...extra })
const digit = (n: number, extra: Partial<KeyboardEvent> = {}) => key({ key: String(n), code: `Digit${n}`, ...extra })
const press = (k: string, code = k, extra: Partial<KeyboardEvent> = {}) => key({ key: k, code, ...extra })

describe('letters always type', () => {
  it('no bare letter does anything on any screen, so typing one always opens search', () => {
    for (const m of MODES) {
      for (const k of 'abcdefghijklmnopqrstuvwxyz') {
        expect(findCommand(letter(k), m, false), `${k} on ${m}`).toBeUndefined()
        expect(findCommand(letter(k, { shiftKey: true }), m, false), `⇧${k} on ${m}`).toBeUndefined()
      }
    }
  })

  it('leaves "/" alone so it can be typed, in and out of text fields', () => {
    const slash = press('/', 'Slash')
    expect(findCommand(slash, 'dump', true)).toBeUndefined()
    expect(findCommand(slash, 'dump', false)).toBeUndefined()
  })
})

describe('the same keys on every screen', () => {
  it('opens search with mod+F, even while typing', () => {
    expect(findCommand(letter('f', mod), 'dump', true)?.id).toBe('palette')
  })

  it('mod+K marks done, mod+Backspace deletes and mod+E opens the thought, on every screen', () => {
    for (const m of MODES) {
      expect(findCommand(letter('k', mod), m, false)?.id).toBe('task.done')
      expect(findCommand(press('Backspace', 'Backspace', mod), m, false)?.id).toBe('task.delete')
      expect(findCommand(letter('e', mod), m, false)?.id).toBe('task.edit')
    }
  })

  it('↵ opens the thought everywhere but Dump, where it edits the text in the list', () => {
    for (const m of ['sort', 'plan', 'today', 'archive'] as const) expect(findCommand(press('Enter'), m, false)?.id).toBe('task.open')
    expect(findCommand(press('Enter'), 'dump', false)?.id).toBe('dump.edit')
  })

  it('⇧↑/⇧↓ pick several and ⌥↑/⌥↓ reorder, on every list screen, Dump included', () => {
    for (const m of LISTS) {
      expect(findCommand(press('ArrowUp', 'ArrowUp', { shiftKey: true }), m, false)?.id).toBe('pick.up')
      expect(findCommand(press('ArrowDown', 'ArrowDown', { shiftKey: true }), m, false)?.id).toBe('pick.down')
      expect(findCommand(press('ArrowUp', 'ArrowUp', { altKey: true }), m, false)?.id).toBe('order.up')
    }
  })

  it('- and = nudge the time, and ⌥1–⌥6 set it, on every list screen', () => {
    for (const m of LISTS) {
      expect(findCommand(press('='), m, false)?.id).toBe('time.longer')
      expect(findCommand(press('-', 'Minus'), m, false)?.id).toBe('time.shorter')
      expect(findCommand(digit(3, { altKey: true }), m, false)?.id).toBe('time.3')
    }
    expect(findCommand(digit(3, { altKey: true }), 'archive', false)).toBeUndefined()
  })

  it('esc drops the picking, only while something is picked', () => {
    const esc = press('Escape')
    setState({ picked: null })
    expect(findCommand(esc, 'today', false)?.id).not.toBe('pick.clear')
    setState({ picked: { anchor: 'a', ids: ['a', 'b'] } })
    expect(findCommand(esc, 'today', false)?.id).toBe('pick.clear')
    setState({ picked: null })
  })
})

describe('digits file into the numbered boxes', () => {
  it('Sort: 1–3 are the lanes, 0 unsorts', () => {
    expect([1, 2, 3].map((n) => findCommand(digit(n), 'sort', false)?.id)).toEqual(['sort.do', 'sort.admin', 'sort.quick'])
    expect(findCommand(digit(0), 'sort', false)?.id).toBe('sort.clear')
    expect(findCommand(digit(5), 'sort', false)).toBeUndefined()
  })

  it('Plan: 1–7 days, 8 later, 0 unplans', () => {
    expect(findCommand(digit(1), 'plan', false)?.id).toBe('plan.day1')
    expect(findCommand(digit(8), 'plan', false)?.id).toBe('plan.later')
    expect(findCommand(digit(0), 'plan', false)?.id).toBe('plan.clear')
  })

  it('Today: 1–9 are the sessions; Dump has no boxes', () => {
    expect(findCommand(digit(2), 'today', false)?.id).toBe('today.session2')
    expect(findCommand(digit(1), 'dump', false)).toBeUndefined()
  })

  it('Sort moves between rows with ⌘↑/⌘↓; ⇧←/⇧→ move sideways on every board', () => {
    expect(findCommand(press('ArrowUp', 'ArrowUp', mod), 'sort', false)?.id).toBe('sort.shift.up')
    expect(findCommand(press('ArrowLeft', 'ArrowLeft', { shiftKey: true }), 'sort', false)?.id).toBe('sort.shift.left')
    expect(findCommand(press('ArrowLeft', 'ArrowLeft', { shiftKey: true }), 'plan', false)?.id).toBe('plan.shift.left')
    expect(findCommand(press('ArrowRight', 'ArrowRight', { shiftKey: true }), 'today', false)?.id).toBe('today.sessionNext')
  })
})

describe('Space', () => {
  it('adds in Dump and Today, and skips to the next in Sort and Plan', () => {
    const space = press(' ', 'Space')
    expect(findCommand(space, 'dump', false)?.id).toBe('dump.new')
    expect(findCommand(space, 'today', false)?.id).toBe('today.add')
    expect(findCommand(space, 'sort', false)?.id).toBe('sort.keep')
    expect(findCommand(space, 'plan', false)?.id).toBe('plan.keep')
  })
})

describe('Today', () => {
  it('⌥F runs the session, ⌥P is for something coming up and ⌥T is "not today", on Today only', () => {
    expect(findCommand(letter('f', { altKey: true }), 'today', false)?.id).toBe('today.session')
    expect(findCommand(letter('p', { altKey: true }), 'today', false)?.id).toBe('today.pause')
    expect(findCommand(letter('t', { altKey: true }), 'today', false)?.id).toBe('today.defer')
    for (const m of MODES.filter((m) => m !== 'today')) expect(findCommand(letter('p', { altKey: true }), m, false)).toBeUndefined()
  })

  it("↵ says you're back while you're away, and opens the thought otherwise", () => {
    setState({ run: { session: 1, queue: [], index: 0, startedAt: 0, phase: 'running', pause: { label: 'Break', startedAt: 0, minutes: 10 } } })
    expect(findCommand(press('Enter'), 'today', false)?.id).toBe('today.back')
    setState({ run: null })
    expect(findCommand(press('Enter'), 'today', false)?.id).toBe('task.open')
  })

  it("esc stops a session once time's up, and does nothing to a running one", () => {
    setState({ run: { session: 1, queue: [], index: 0, startedAt: 0, phase: 'over' } })
    expect(findCommand(press('Escape'), 'today', false)?.id).toBe('today.stop')
    setState({ run: { session: 1, queue: [], index: 0, startedAt: 0, phase: 'running' } })
    expect(findCommand(press('Escape'), 'today', false)).toBeUndefined()
    setState({ run: null })
  })
})

describe('mod+S', () => {
  it('sets the day on every screen and while typing, so the browser never offers to save the page', () => {
    const modS = letter('s', mod)
    for (const m of MODES) {
      expect(findCommand(modS, m, false)?.id).toBe('task.when')
      expect(findCommand(modS, m, true)?.id).toBe('task.when')
    }
  })

  it('export moved to mod+shift+S', () => {
    expect(findCommand(key({ key: 'S', code: 'KeyS', shiftKey: true, ...mod }), 'dump', false)?.id).toBe('data.export')
  })
})

describe('the fill-in in Dump (→)', () => {
  it('→ opens the thought sheet on what is missing, and never reaches the other screens', () => {
    expect(findCommand(press('ArrowRight'), 'dump', false)?.id).toBe('dump.finish')
    for (const m of MODES.filter((m) => m !== 'dump')) {
      expect(findCommand(press('ArrowRight'), m, false)?.id ?? '').not.toMatch(/^dump\./)
    }
  })

  it('⌫ no longer deletes in Dump: ⌘⌫ does, as everywhere', () => {
    expect(findCommand(press('Backspace'), 'dump', false)).toBeUndefined()
  })
})

describe('sessions mode', () => {
  const sessions = () => setState({ workMode: 'sessions', mode: 'today' })
  const full = () => setState({ workMode: 'full', outbox: null })

  it('puts the other screens away, and leaves the keys for Today', () => {
    sessions()
    for (const spec of [{ n: 1, id: 'mode.dump' }, { n: 2, id: 'mode.sort' }, { n: 3, id: 'mode.plan' }, { n: 5, id: 'mode.archive' }]) {
      expect(findCommand(digit(spec.n, { shiftKey: true }), 'today', false)?.id, spec.id).toBeUndefined()
    }
    expect(findCommand(letter('f', { altKey: true }), 'today', false)?.id).toBe('today.session')
    expect(findCommand(press('ArrowRight', 'ArrowRight', { altKey: true }), 'today', false)).toBeUndefined()
    full()
    expect(findCommand(digit(2, { shiftKey: true }), 'today', false)?.id).toBe('mode.sort')
  })

  it('⌥S sends this session, ⌥⇧S all of them, and only on Today', () => {
    expect(findCommand(letter('s', { altKey: true }), 'today', false)?.id).toBe('things.session')
    expect(findCommand(letter('s', { altKey: true, shiftKey: true }), 'today', false)?.id).toBe('things.all')
    for (const m of MODES.filter((m) => m !== 'today')) expect(findCommand(letter('s', { altKey: true }), m, false)).toBeUndefined()
  })

  it('⌥↵ says they arrived, only while something waits to be confirmed', () => {
    const enter = press('Enter', 'Enter', { altKey: true })
    expect(findCommand(enter, 'today', false)).toBeUndefined()
    setState({ outbox: { ids: ['a'], sent: 1, parts: 1 } })
    expect(findCommand(enter, 'today', false)?.id).toBe('things.arrived')
    full()
  })
})
