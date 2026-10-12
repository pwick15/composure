import { useEffect } from 'react'
import { flushSync } from 'react-dom'
import { splitLines } from '../lib/text'
import { openPalette, pasteLines, startDraft, toggleHelp } from '../state/actions'
import { getState } from '../state/store'
import { findCommand, hudOf } from './commands'
import { feedback } from './feedback'
import { isTextField } from './keys'

const MODIFIER_KEYS = new Set(['Shift', 'Meta', 'Control', 'Alt', 'CapsLock', 'Fn'])

function onKeyDown(e: KeyboardEvent) {
  if (e.defaultPrevented || e.isComposing || e.key === 'Dead' || e.key === 'Process') return
  if (MODIFIER_KEYS.has(e.key)) return

  const s = getState()
  // The palette input owns the keyboard while it is open.
  if (s.palette.open) return

  if (s.helpOpen) {
    if (e.key === 'Escape' || e.key === '?') {
      e.preventDefault()
      feedback(e, 'Close')
      toggleHelp()
    }
    return
  }

  const typing = isTextField(e.target)
  const cmd = findCommand(e, s.mode, typing)
  if (cmd) {
    e.preventDefault()
    if (e.repeat && !cmd.repeat) return
    feedback(e, hudOf(cmd))
    // Render synchronously so the next key press already sees the new UI (focus, cursor).
    flushSync(cmd.run)
    return
  }

  if (typing) return
  if (e.key === 'Tab') return e.preventDefault()
  if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return

  if (s.mode === 'dump') {
    // Type anywhere: the key becomes the first character of a new thought.
    e.preventDefault()
    flushSync(() => startDraft(e.key))
  } else if (/[^\s\d]/.test(e.key)) {
    // Things-style type travel: unbound letters open search, seeded with the key.
    e.preventDefault()
    feedback(e, 'Search')
    flushSync(() => openPalette(e.key))
  }
}

function onPaste(e: ClipboardEvent) {
  if (isTextField(e.target) || getState().palette.open) return
  const lines = splitLines(e.clipboardData?.getData('text/plain') ?? '')
  if (!lines.length) return
  e.preventDefault()
  pasteLines(lines)
}

export function useGlobalKeys() {
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('paste', onPaste)
    }
  }, [])
}
