import { cleanMinutes } from './duration'

// Something comes up mid-session: the bathroom, a call, hanging the laundry, a break. It pauses
// the clock on your task (the task keeps all the time it had), and everything after it slides
// later by however long it took.

export interface PausePreset {
  label: string
  /** Null for open-ended: it lasts until you say you're back (a call). */
  minutes: number | null
}

/** What 1–4 start in one key press. */
export const PAUSE_PRESETS: PausePreset[] = [
  { label: 'Bathroom', minutes: 5 },
  { label: 'Break', minutes: 10 },
  { label: 'Call', minutes: null },
  { label: 'Chore', minutes: 15 },
]

const UNIT = /^(?:(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)|(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)?)$/i

/**
 * "call mum 15m" → Call mum for 15 minutes; "laundry" → open-ended; "1h" → a break for an hour.
 * A trailing number is minutes unless it says hours. No words at all is just a break.
 */
export function parsePause(text: string): PausePreset {
  const words = text.trim().replace(/\s+/g, ' ')
  const tail = words.match(/(?:^|\s)(\d+(?:\.\d+)?\s*(?:h|hr|hrs|hours?|m|mins?|minutes?)?)$/i)
  let minutes: number | null = null
  let label = words
  if (tail) {
    const m = UNIT.exec(tail[1].trim())
    const value = m && Number(m[1] ?? m[3])
    if (value) {
      minutes = cleanMinutes(Math.round(m![2] ? value * 60 : value))
      label = words.slice(0, words.length - tail[1].length).trim()
    }
  }
  label = label || 'Break'
  return { label: label[0].toUpperCase() + label.slice(1), minutes }
}
