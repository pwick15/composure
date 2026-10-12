import { getState } from '../state/store'
import { comboId, comboParts, eventCombo, parseCombo } from './keys'

// ---------------------------------------------------------------- keycap pulse

/**
 * Flashes every on-screen keycap bound to this combo. Runs straight against the DOM
 * so a key press costs no React render.
 */
export function pulse(id: string) {
  const els = document.querySelectorAll<HTMLElement>(`[data-kbd~="${CSS.escape(id)}"]`)
  for (const el of els) {
    el.classList.remove('is-hit')
    void el.offsetWidth // restart the animation
    el.classList.add('is-hit')
  }
}

// ---------------------------------------------------------------- keystroke HUD

export interface HudEntry {
  id: number
  keys: string[]
  label: string
  count: number
}

const HUD_TTL = 1500
const HUD_MAX = 4

let entries: HudEntry[] = []
let seq = 0
const timers = new Map<number, ReturnType<typeof setTimeout>>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

function expire(id: number) {
  clearTimeout(timers.get(id))
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id)
      entries = entries.filter((e) => e.id !== id)
      emit()
    }, HUD_TTL),
  )
}

export const hudStore = {
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  get: () => entries,
}

function hudPush(keys: string[], label: string) {
  const last = entries.at(-1)
  if (last && last.label === label && last.keys.join() === keys.join()) {
    entries = [...entries.slice(0, -1), { ...last, count: last.count + 1 }]
    expire(last.id)
  } else {
    const entry = { id: ++seq, keys, label, count: 1 }
    entries = [...entries.slice(-(HUD_MAX - 1)), entry]
    expire(entry.id)
  }
  emit()
}

/** Visual feedback for a handled key press: pulse matching keycaps and log it in the HUD. */
export function feedback(e: KeyboardEvent, label: string) {
  const combo = eventCombo(e)
  pulse(comboId(combo))
  // A bare Shift (the double-tap) reads better as two shift caps.
  if (getState().hud) hudPush(e.key === 'Shift' ? ['⇧', '⇧'] : comboParts(combo), label)
}

/** Same as feedback() for actions that did not come from a real key event (e.g. clicks). */
export function feedbackFor(spec: string, label: string) {
  const combo = parseCombo(spec)
  pulse(comboId(combo))
  if (getState().hud) hudPush(comboParts(combo), label)
}
