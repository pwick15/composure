import { describe, expect, it } from 'vitest'
import type { Mode } from '../lib/types'
import { findCommand } from './commands'
import { setState, useStore } from '../state/store'
import { isMac } from './keys'

const key = (init: Partial<KeyboardEvent>) =>
  ({ key: '', code: '', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...init }) as KeyboardEvent

const mod = isMac ? { metaKey: true } : { ctrlKey: true }
const MODES: Mode[] = ['dump', 'sort', 'plan', 'today', 'archive']

describe('findCommand', () => {
  it('leaves "/" alone so it can be typed, in and out of text fields', () => {
    const slash = key({ key: '/', code: 'Slash' })
    expect(findCommand(slash, 'dump', true)).toBeUndefined()
    expect(findCommand(slash, 'dump', false)).toBeUndefined()
  })

  it('opens search with mod+F while typing', () => {
    const modF = key({ key: 'f', code: 'KeyF', ...mod })
    expect(findCommand(modF, 'dump', true)?.id).toBe('palette')
  })

  it('mod+K marks done, and mod+Backspace deletes, on every screen', () => {
    const modK = key({ key: 'k', code: 'KeyK', ...mod })
    const modBack = key({ key: 'Backspace', code: 'Backspace', ...mod })
    for (const m of MODES) {
      expect(findCommand(modK, m, false)?.id).toBe('task.done')
      expect(findCommand(modBack, m, false)?.id).toBe('task.delete')
    }
  })

  it('bare letters do nothing in Dump, so typing there goes to search', () => {
    for (const k of 'xektqwas'.split('')) {
      expect(findCommand(key({ key: k, code: `Key${k.toUpperCase()}` }), 'dump', false)).toBeUndefined()
    }
  })
})

describe('mod+E', () => {
  it('edits the selected thought on every screen, and bare E does so on Today only besides Sort and Plan', () => {
    const modE = key({ key: 'e', code: 'KeyE', ...mod })
    for (const m of MODES) expect(findCommand(modE, m, false)?.id).toBe('task.edit')
    const e = key({ key: 'e', code: 'KeyE' })
    expect(findCommand(e, 'today', false)?.id).toBe('today.edit')
    expect(findCommand(e, 'dump', false)).toBeUndefined()
    expect(findCommand(e, 'archive', false)).toBeUndefined()
  })
})

describe('alt+arrows', () => {
  it('reorder the list on Sort, Plan and Today, and Dump keeps its own move', () => {
    const up = key({ key: 'ArrowUp', code: 'ArrowUp', altKey: true })
    for (const m of ['sort', 'plan', 'today'] as const) expect(findCommand(up, m, false)?.id).toBe(`${m}.orderUp`)
    expect(findCommand(up, 'dump', false)?.id).toBe('dump.moveUp')
  })
})

describe('mod+S', () => {
  it('sets the day on every screen and while typing, so the browser never offers to save the page', () => {
    const modS = key({ key: 's', code: 'KeyS', ...mod })
    for (const m of MODES) {
      expect(findCommand(modS, m, false)?.id).toBe('task.when')
      expect(findCommand(modS, m, true)?.id).toBe('task.when')
    }
  })

  it('export moved to mod+shift+S', () => {
    const modShiftS = key({ key: 'S', code: 'KeyS', shiftKey: true, ...mod })
    expect(findCommand(modShiftS, 'dump', false)?.id).toBe('data.export')
  })
})

describe('the fill-in in Dump (→)', () => {
  const press = (k: string, code = k) => findCommand(key({ key: k, code }), 'dump', false)
  const initial = useStore.getState()

  it('→ opens it, and while it is open the arrows, digits, ↵ and ⌫ belong to it', () => {
    setState(initial, true)
    expect(press('ArrowRight')?.id).toBe('dump.finish')
    expect(press('Backspace')?.id).toBe('dump.delete')
    expect(press('1', 'Digit1')).toBeUndefined()

    setState({ items: [{ id: 'a', text: 'a', createdAt: 0, quadrant: null, slot: null, done: false, doneAt: null, parentId: null, minutes: null, session: 1 }] })
    setState({ selectedId: 'a', dumpFinish: { id: 'a', step: 'quadrant', col: 0 } })
    expect(press('ArrowRight')?.id).toBe('dump.finish.right')
    expect(press('ArrowDown')?.id).toBe('dump.finish.down')
    expect(press('Enter')?.id).toBe('dump.finish.enter')
    expect(press('Backspace')?.id).toBe('dump.finish.backspace')
    expect(press('3', 'Digit3')?.id).toBe('dump.finish.3')
    setState(initial, true)
  })

  it('never reaches the other screens', () => {
    for (const m of MODES.filter((m) => m !== 'dump')) {
      expect(findCommand(key({ key: 'ArrowRight', code: 'ArrowRight' }), m, false)?.id ?? '').not.toMatch(/^dump\./)
    }
  })
})
