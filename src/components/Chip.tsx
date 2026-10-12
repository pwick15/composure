import { motion } from 'motion/react'
import type { Ref } from 'react'
import { EXIT_FAST, keepFocus } from '../lib/motion'
import type { Item } from '../lib/types'
import { Kbd } from './Kbd'

interface ChipProps {
  item: Item
  ref?: Ref<HTMLDivElement>
  /** Dashed preview of where the current card will land. */
  ghost?: boolean
  /** Just landed here: flash once. */
  fresh?: boolean
  meta?: string
  onSelect?: () => void
}

export function Chip({ item, ref, ghost, fresh, meta, onSelect }: ChipProps) {
  return (
    <motion.div
      ref={ref}
      layout="position"
      role={ghost ? undefined : 'button'}
      className="chip"
      data-q={item.quadrant ?? 'none'}
      data-ghost={ghost || undefined}
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
      <span className="chip__text">{item.text}</span>
      {meta && <span className="chip__meta">{meta}</span>}
      {ghost && <Kbd k="enter" size="xs" />}
    </motion.div>
  )
}
