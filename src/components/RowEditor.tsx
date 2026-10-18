import { useLayoutEffect, useRef } from 'react'
import { feedback } from '../keyboard/feedback'
import { autosize } from '../lib/dom'
import type { Item } from '../lib/types'
import { trayCancel, trayCommit } from '../state/actions'
import { getState } from '../state/store'

/** A thought's text, edited in place on a list row (Today, Archive). ↵ saves, esc cancels, clicking away saves. */
export function RowEditor({ item }: { item: Item }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current!
    el.focus({ preventScroll: true })
    el.setSelectionRange(el.value.length, el.value.length)
    autosize(el)
    el.closest('li')?.scrollIntoView({ block: 'nearest' })
  }, [])
  return (
    <textarea
      ref={ref}
      className="row__input"
      defaultValue={item.text}
      rows={1}
      aria-label="Edit text"
      spellCheck
      onClick={(e) => e.stopPropagation()}
      onInput={(e) => autosize(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          feedback(e.nativeEvent, 'Saved')
          trayCommit(item.id, e.currentTarget.value)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          feedback(e.nativeEvent, 'Cancel')
          trayCancel()
        }
      }}
      onBlur={(e) => {
        if (getState().trayEditing === item.id) trayCommit(item.id, e.currentTarget.value)
      }}
    />
  )
}
