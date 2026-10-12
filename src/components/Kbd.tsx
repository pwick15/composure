import { comboId, formatCombo, parseCombo } from '../keyboard/keys'

interface KbdProps {
  /** Key spec, e.g. "mod+k", "shift+1", "enter". */
  k?: string
  /** Literal label instead of a key spec (e.g. "1–7"). */
  label?: string
  /** Extra key specs that should also make this keycap flash. */
  also?: string[]
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

export function Kbd({ k, label, also = [], size = 'sm', className = '' }: KbdProps) {
  const ids = [k, ...also]
    .filter((s): s is string => Boolean(s))
    .map((s) => comboId(parseCombo(s)))
    .join(' ')
  return (
    <kbd className={`kbd kbd--${size} ${className}`} data-kbd={ids || undefined}>
      {label ?? (k ? formatCombo(k) : '')}
    </kbd>
  )
}

/** A row of keycaps, e.g. Q W A S. */
export function Keys({ keys, size }: { keys: string[]; size?: KbdProps['size'] }) {
  return (
    <span className="keys">
      {keys.map((k) => (
        <Kbd key={k} k={k} size={size} />
      ))}
    </span>
  )
}
