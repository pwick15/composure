import { describe, expect, it } from 'vitest'
import { findCommand } from './commands'
import { isMac } from './keys'

const key = (init: Partial<KeyboardEvent>) =>
  ({ key: '', code: '', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...init }) as KeyboardEvent

describe('findCommand', () => {
  it('leaves "/" alone so it can be typed, in and out of text fields', () => {
    const slash = key({ key: '/', code: 'Slash' })
    expect(findCommand(slash, 'dump', true)).toBeUndefined()
    expect(findCommand(slash, 'dump', false)).toBeUndefined()
  })

  it('still opens search with mod+K while typing', () => {
    const modK = key({ key: 'k', code: 'KeyK', ...(isMac ? { metaKey: true } : { ctrlKey: true }) })
    expect(findCommand(modK, 'dump', true)?.id).toBe('palette')
  })
})
