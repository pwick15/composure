import { describe, expect, it } from 'vitest'
import type { Mode } from '../lib/types'
import { findCommand } from './commands'
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
