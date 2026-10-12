export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)

export interface Combo {
  key: string
  mod: boolean
  ctrl: boolean
  alt: boolean
  shift: boolean
}

const ALIASES: Record<string, string> = { esc: 'escape', return: 'enter', del: 'delete' }

const NAMED: Record<string, string> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'enter',
  Escape: 'escape',
  Backspace: 'backspace',
  Delete: 'delete',
  Tab: 'tab',
  ' ': 'space',
  Home: 'home',
  End: 'end',
}

const LABELS: Record<string, string> = {
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  enter: '↵',
  escape: 'esc',
  backspace: '⌫',
  delete: 'del',
  tab: 'tab',
  space: 'space',
  home: 'home',
  end: 'end',
}

const isPunct = (key: string) => key.length === 1 && !/[a-z0-9]/.test(key)

const cache = new Map<string, Combo>()

/** Parses "mod+shift+z", "shift+1", "?", "enter". `mod` is ⌘ on macOS and Ctrl elsewhere. */
export function parseCombo(spec: string): Combo {
  const hit = cache.get(spec)
  if (hit) return hit
  const parts = spec.toLowerCase().split('+')
  const raw = parts.pop() ?? ''
  const combo: Combo = {
    key: ALIASES[raw] ?? raw,
    mod: parts.includes('mod'),
    ctrl: parts.includes('ctrl'),
    alt: parts.includes('alt'),
    shift: parts.includes('shift'),
  }
  cache.set(spec, combo)
  return combo
}

/**
 * The physical key, layout-independent for letters and digits (KeyQ is always "q",
 * so QWAS keeps its 2x2 shape). Numpad digits count as digits.
 */
export function eventKey(e: KeyboardEvent): string {
  const code = e.code ?? ''
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
  if (/^Digit\d$/.test(code)) return code.slice(5)
  if (/^Numpad\d$/.test(code)) return code.slice(6)
  if (code === 'NumpadEnter') return 'enter'
  return NAMED[e.key] ?? e.key.toLowerCase()
}

export function matchCombo(e: KeyboardEvent, c: Combo): boolean {
  if (eventKey(e) !== c.key) return false
  if ((isMac ? e.metaKey : e.ctrlKey) !== c.mod) return false
  if (isMac && e.ctrlKey !== c.ctrl) return false
  if (!isMac && e.metaKey) return false
  if (e.altKey !== c.alt) return false
  // "?" is shift+/ on most layouts; for punctuation the character already encodes shift.
  if (!isPunct(c.key) && e.shiftKey !== c.shift) return false
  return true
}

export function comboId(c: Combo): string {
  return [c.mod && 'mod', c.ctrl && 'ctrl', c.alt && 'alt', c.shift && !isPunct(c.key) && 'shift', c.key]
    .filter(Boolean)
    .join('+')
}

export function eventCombo(e: KeyboardEvent): Combo {
  return {
    key: eventKey(e),
    mod: isMac ? e.metaKey : e.ctrlKey,
    ctrl: isMac && e.ctrlKey,
    alt: e.altKey,
    shift: e.shiftKey,
  }
}

const keyLabel = (key: string) => LABELS[key] ?? (key.length === 1 ? key.toUpperCase() : key)

/** Display parts for a combo, e.g. ["⌘", "K"]. */
export function comboParts(c: Combo): string[] {
  const parts: string[] = []
  if (c.ctrl) parts.push('⌃')
  if (c.mod) parts.push(isMac ? '⌘' : 'Ctrl')
  if (c.alt) parts.push(isMac ? '⌥' : 'Alt')
  if (c.shift && !isPunct(c.key)) parts.push('⇧')
  parts.push(keyLabel(c.key))
  return parts
}

export function formatCombo(spec: string): string {
  return comboParts(parseCombo(spec)).join(isMac ? '' : '+')
}

export function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file'].includes(target.type)
  }
  return false
}
