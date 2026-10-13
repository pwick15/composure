// The tab icon while a work session runs: minutes left in the middle, the current task's
// window as a ring around it. It stays readable at 16px, and in pinned tabs that have no title.

const SIZE = 64
const INK = '#0b0c0e'
const TRACK = '#353b43'
const ACCENT = '#c2f04a'
const ALERT = '#ff6b5b'

export interface IconState {
  /** The big text: minutes left, "1h" past 99 of them, or "!" once time is up. */
  label: string
  /** How far through the current task's window, 0 to 1. */
  progress: number
  over: boolean
}

/** Minutes left as the icon writes them. */
export function iconLabel(msLeft: number): string {
  const minutes = Math.max(0, Math.ceil(msLeft / 60_000))
  return minutes > 99 ? `${Math.round(minutes / 60)}h` : String(minutes)
}

/** The icon as a PNG data URL, or null where there is no canvas to draw on. */
export function timerIcon({ label, progress, over }: IconState): string | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = INK
  ctx.beginPath()
  ctx.roundRect(0, 0, SIZE, SIZE, 14)
  ctx.fill()

  const c = SIZE / 2
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.strokeStyle = TRACK
  ctx.beginPath()
  ctx.arc(c, c, 25, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = over ? ALERT : ACCENT
  ctx.beginPath()
  const sweep = over ? 1 : Math.min(1, Math.max(0.02, progress))
  ctx.arc(c, c, 25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sweep)
  ctx.stroke()

  ctx.fillStyle = over ? ALERT : '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${label.length > 2 ? 26 : 32}px ui-monospace, Menlo, Consolas, monospace`
  ctx.fillText(label, c, c + 2)
  return canvas.toDataURL('image/png')
}
