import type { ReactNode } from 'react'
import { isOverdue, lateLabel, longDate, slotLabel } from '../lib/dates'
import { fmt } from '../lib/duration'
import { FIELD_LABEL, type Field } from '../lib/fields'
import { keepFocus } from '../lib/motion'
import { QUADRANT_BY_ID } from '../lib/quadrants'
import type { Item } from '../lib/types'
import { sheetOpenFor } from '../state/actions'
import { useStore } from '../state/store'

interface TagProps {
  item: Item
  /** Click to change it: opens the thought sheet on this tag's row. */
  edit?: boolean
}

/** A tag, or with `edit` a button that opens the thought sheet on its row. */
function Tag({ item, edit, row, className = '', title, q, children }: TagProps & { row: Field; className?: string; title?: string; q?: string; children: ReactNode }) {
  if (!edit) {
    return (
      <span className={`tag ${className}`} title={title} data-q={q}>
        {children}
      </span>
    )
  }
  return (
    <button
      type="button"
      className={`tag ${className}`}
      title={title ?? `Change the ${FIELD_LABEL[row]}`}
      data-q={q}
      onMouseDown={keepFocus}
      onClick={(e) => {
        e.stopPropagation()
        sheetOpenFor([item.id], 'field', row)
      }}
    >
      {children}
    </button>
  )
}

export function QuadrantTag({ item, edit }: TagProps) {
  if (!item.quadrant) {
    return (
      <Tag item={item} edit={edit} row="quadrant" className="tag--muted">
        Unsorted
      </Tag>
    )
  }
  return (
    <Tag item={item} edit={edit} row="quadrant" q={item.quadrant}>
      {QUADRANT_BY_ID[item.quadrant].title}
    </Tag>
  )
}

/** The day a thought is planned for, or how late it is ("2d late", with the date on hover). */
export function SlotTag({ item, today, edit }: TagProps & { today: string }) {
  if (!item.slot) return null
  if (isOverdue(item.slot, today)) {
    return (
      <Tag item={item} edit={edit} row="slot" className="tag--overdue" title={`Was planned for ${longDate(item.slot)}`}>
        {lateLabel(item.slot, today)}
      </Tag>
    )
  }
  return (
    <Tag item={item} edit={edit} row="slot">
      {slotLabel(item.slot, today)}
    </Tag>
  )
}

/** "~30m". With `nudge`, a thought with no estimate says so instead of showing nothing. */
export function TimeTag({ item, nudge = false, minutes = item.minutes, edit }: TagProps & { nudge?: boolean; minutes?: number | null }) {
  if (minutes) {
    return (
      <Tag item={item} edit={edit} row="minutes" className="tag--time" title={edit ? undefined : 'Estimated time'}>
        ~{fmt(minutes)}
      </Tag>
    )
  }
  if (!nudge) return null
  return (
    <Tag item={item} edit={edit} row="minutes" className="tag--muted">
      no time
    </Tag>
  )
}

/** "↳ Plan trip": which thought a subtask belongs to, wherever the subtask shows up. */
export function ParentRef({ item, className = '' }: { item: Item; className?: string }) {
  const text = useStore((s) => (item.parentId ? s.items.find((i) => i.id === item.parentId)?.text : undefined))
  if (!text) return null
  return (
    <span className={`parent-ref ${className}`} title={`Part of "${text}"`}>
      <span aria-hidden>↳</span> {text}
    </span>
  )
}
