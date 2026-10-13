import { motion } from 'motion/react'
import type { Ref } from 'react'
import { fmt } from '../lib/duration'
import { EXIT_FAST, keepFocus } from '../lib/motion'
import type { Item } from '../lib/types'
import { ParentRef } from './Tags'

interface ChipProps {
  item: Item
  ref?: Ref<HTMLDivElement>
  /** The thought selected with ↑/↓, also shown large in the tray. */
  selected?: boolean
  /** Just landed here: flash once. */
  fresh?: boolean
  meta?: string
  onSelect?: () => void
}

export function Chip({ item, ref, selected, fresh, meta, onSelect }: ChipProps) {
  return (
    <motion.div
      ref={ref}
      layout="position"
      role="button"
      className="chip"
      data-q={item.quadrant ?? 'none'}
      data-selected={selected || undefined}
      data-fresh={fresh || undefined}
      data-done={item.done || undefined}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94, transition: EXIT_FAST }}
      onMouseDown={keepFocus}
      onClick={(e) => {
        e.stopPropagation()
        onSelect?.()
      }}
    >
      <span className="chip__body">
        <span className="chip__text">{item.text}</span>
        <ParentRef item={item} className="parent-ref--chip" />
      </span>
      {(meta || item.minutes) && (
        <span className="chip__meta">{[meta, item.minutes && fmt(item.minutes)].filter(Boolean).join(' · ')}</span>
      )}
    </motion.div>
  )
}
