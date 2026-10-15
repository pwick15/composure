import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, type ClipboardEvent, type KeyboardEvent, type Ref } from 'react'
import { flushSync } from 'react-dom'
import { Kbd } from '../components/Kbd'
import { QuadrantTag, SlotTag, TimeTag } from '../components/Tags'
import { feedback } from '../keyboard/feedback'
import { isMac } from '../keyboard/keys'
import { todayKey } from '../lib/dates'
import { autosize } from '../lib/dom'
import { EXIT_FAST, keepFocus } from '../lib/motion'
import { splitLines } from '../lib/text'
import { sumMinutes } from '../lib/duration'
import { live } from '../lib/selectors'
import { childrenOf, draftIndex, leaves, parentIds, progress, treeOrder } from '../lib/tree'
import type { Item } from '../lib/types'
import {
  editorAddSub,
  editorBackspaceEmpty,
  editorEnter,
  editorExit,
  editorIndent,
  editorMove,
  editorPaste,
  sameTarget,
  setMode,
  startDraft,
  startEdit,
  toggleDone,
  type EditTarget,
} from '../state/actions'
import { useStore } from '../state/store'

/** Items committed from the editor appear in place without an entrance animation. */
const bornInPlace = new Set<string>()

function Editor({ target, initial }: { target: EditTarget; initial: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const live = useStore((s) => sameTarget(s.editing, target))

  // A closed draft lingers for its exit animation; drop focus at once so the next
  // key press reaches the app instead of a dying textarea.
  useLayoutEffect(() => {
    if (!live) ref.current?.blur()
  }, [live])

  // Editors are keyed per target, so this runs once per line being edited.
  const caretAtStart = target.kind === 'item' && target.caret === 'start'
  useLayoutEffect(() => {
    const el = ref.current!
    el.focus({ preventScroll: true })
    const pos = caretAtStart ? 0 : el.value.length
    el.setSelectionRange(pos, pos)
    autosize(el)
    el.closest('li')?.scrollIntoView({ block: 'nearest' })
  }, [caretAtStart])

  const run = (fn: () => void) => flushSync(fn)
  // Double-tap Shift finishes typing, like Esc. Any other key in between resets it.
  const lastShift = useRef(0)

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const native = e.nativeEvent
    if (native.isComposing || !live) return
    const el = e.currentTarget
    const value = el.value
    const mod = isMac ? e.metaKey : e.ctrlKey

    if (e.key === 'Shift') {
      if (e.repeat) return
      const now = performance.now()
      if (now - lastShift.current < 400) {
        lastShift.current = 0
        feedback(native, 'Finish')
        run(() => editorExit(target, value))
      } else {
        lastShift.current = now
      }
      return
    }
    lastShift.current = 0

    if (e.key === 'Enter' && mod && target.kind === 'item') {
      e.preventDefault()
      feedback(native, 'Done')
      const id = target.id
      run(() => {
        editorExit(target, value)
        toggleDone(id)
      })
      return
    }
    if (e.key === 'Tab' && !mod && !e.altKey) {
      e.preventDefault()
      feedback(native, e.shiftKey ? 'Un-nest' : 'Nest')
      run(() => editorIndent(target, value, e.shiftKey ? -1 : 1))
      return
    }
    if (e.key === 'Enter' && e.altKey) {
      e.preventDefault()
      feedback(native, 'Subtask')
      run(() => editorAddSub(target, value))
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      feedback(native, value.trim() ? 'Next' : 'Finish')
      if (value.trim() && target.kind === 'draft') bornInPlace.add('pending')
      run(() => editorEnter(target, value))
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      feedback(native, 'Finish')
      run(() => editorExit(target, value))
      return
    }
    if (e.key === 'Backspace' && value === '') {
      e.preventDefault()
      feedback(native, 'Back')
      run(() => editorBackspaceEmpty(target))
      return
    }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey && !mod && !e.altKey) {
      const collapsed = el.selectionStart === el.selectionEnd
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20
      const singleLine = el.scrollHeight < lineHeight * 1.8 + 24
      const up = e.key === 'ArrowUp'
      const atEdge = up ? el.selectionStart === 0 : el.selectionEnd === value.length
      if (collapsed && (singleLine || atEdge)) {
        e.preventDefault()
        feedback(native, up ? 'Up' : 'Down')
        run(() => editorMove(target, value, up ? -1 : 1))
      }
    }
  }

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text/plain')
    if (!text.includes('\n')) return
    const lines = splitLines(text)
    if (lines.length < 2) return
    e.preventDefault()
    const el = e.currentTarget
    const merged = el.value.slice(0, el.selectionStart) + lines[0] + el.value.slice(el.selectionEnd)
    run(() => editorPaste(target, merged, lines.slice(1)))
  }

  return (
    <textarea
      ref={ref}
      className="row__input"
      defaultValue={initial}
      rows={1}
      placeholder={target.kind === 'draft' ? 'Type a thought…' : ''}
      aria-label="Thought"
      spellCheck
      onInput={(e) => autosize(e.currentTarget)}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onBlur={(e) => editorExit(target, e.currentTarget.value)}
    />
  )
}

interface RowProps {
  item: Item
  /** The row's label in the left gutter: a number, or a tree branch for a subtask. */
  gutter: string
  sub: boolean
  /** Subtasks done out of subtasks, when this thought has any. */
  kids: { done: number; total: number } | null
  /** What a parent's subtasks add up to, or this thought's own estimate. */
  minutes: number | null
  selected: boolean
  editing: EditTarget | null
  today: string
  ref?: Ref<HTMLLIElement>
}

function Row({ item, gutter, sub, kids, minutes, selected, editing, today, ref }: RowProps) {
  const quiet = bornInPlace.has(item.id)
  return (
    <motion.li
      ref={ref}
      layout="position"
      className="row"
      data-sub={sub || undefined}
      data-selected={selected || undefined}
      data-editing={editing ? '' : undefined}
      initial={quiet ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16, transition: EXIT_FAST }}
      onClick={() => !editing && startEdit(item.id)}
    >
      <span className="row__index">{gutter}</span>
      {editing ? (
        <Editor key={`item-${item.id}`} target={editing} initial={item.text} />
      ) : (
        <span className="row__text">{item.text}</span>
      )}
      <span className="row__meta">
        {kids ? (
          <>
            <TimeTag item={item} minutes={minutes} />
            <span className="tag" title="Subtasks done">
              {kids.done}/{kids.total}
            </span>
          </>
        ) : (
          <>
            {item.quadrant && <QuadrantTag item={item} />}
            <SlotTag item={item} today={today} />
            <TimeTag item={item} />
          </>
        )}
      </span>
    </motion.li>
  )
}

function DraftRow({ target, ref }: { target: Extract<EditTarget, { kind: 'draft' }>; ref?: Ref<HTMLLIElement> }) {
  return (
    <motion.li
      ref={ref}
      layout="position"
      className="row row--draft"
      data-sub={target.parentId !== null || undefined}
      data-editing=""
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.06 } }}
    >
      <span className="row__index row__index--prompt">›</span>
      <Editor key={target.nonce} target={target} initial={target.seed} />
      <span className="row__meta row__meta--hint">
        <Kbd k="enter" size="xs" /> next
      </span>
    </motion.li>
  )
}

function EmptyState() {
  return (
    <motion.button
      className="dump-empty"
      onMouseDown={keepFocus}
      onClick={() => startDraft()}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <span className="dump-empty__prompt">
        <span className="prompt-glyph">›</span>
        <span className="caret-block" />
      </span>
      <span className="dump-empty__title">Start typing. Anything. Everything.</span>
      <span className="dump-empty__keys">
        <span>
          <Kbd label="a–z" /> type a thought
        </span>
        <span>
          <Kbd k="enter" /> next line
        </span>
        <span>
          <Kbd k="mod+v" /> paste a list
        </span>
        <span>
          <Kbd k="?" /> shortcuts
        </span>
      </span>
    </motion.button>
  )
}

export function DumpMode() {
  const all = useStore((s) => s.items)
  const selectedId = useStore((s) => s.selectedId)
  const editing = useStore((s) => s.editing)
  const today = todayKey()
  // Finished thoughts live in the Archive, not here.
  const items = useMemo(() => live(all), [all])
  const listRef = useRef<HTMLOListElement>(null)

  // An item committed from the draft replaces it in place; skip its entrance animation.
  if (bornInPlace.delete('pending') && editing?.kind === 'draft' && editing.afterId) {
    bornInPlace.add(editing.afterId)
  }

  useEffect(() => {
    if (!selectedId) return
    listRef.current?.querySelector('[data-selected]')?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  const draft = editing?.kind === 'draft' ? editing : null
  const unsorted = leaves(items).filter((i) => !i.quadrant).length
  const parents = parentIds(items)
  const tree = treeOrder(items)
  let top = 0
  const nodes = tree.map((item, i) => {
    const sub = parents.size > 0 && item.parentId !== null && parents.has(item.parentId)
    if (!sub) top++
    const lastSibling = sub && !(tree[i + 1]?.parentId === item.parentId)
    return (
      <Row
        key={item.id}
        item={item}
        gutter={sub ? (lastSibling ? '└' : '├') : String(top).padStart(2, '0')}
        sub={sub}
        kids={parents.has(item.id) ? progress(all, item.id) : null}
        minutes={parents.has(item.id) ? sumMinutes(childrenOf(items, item.id)) || null : item.minutes}
        selected={selectedId === item.id}
        editing={editing?.kind === 'item' && editing.id === item.id ? editing : null}
        today={today}
      />
    )
  })
  if (draft) nodes.splice(draftIndex(items, draft.afterId, draft.parentId), 0, <DraftRow key="draft" target={draft} />)

  return (
    <div className="dump">
      <div className="dump__inner">
        <header className="dump__head">
          <div className="eyebrow">// brain dump</div>
          <h1>What's on your mind?</h1>
          <p className="lede">
            Just type. <Kbd k="enter" size="xs" /> starts the next line. Don't sort, don't judge, get it out.
          </p>
        </header>

        {nodes.length === 0 ? (
          <EmptyState />
        ) : (
          <ol className="dump__list" ref={listRef}>
            <AnimatePresence initial={false} mode="popLayout">
              {nodes}
            </AnimatePresence>
          </ol>
        )}

        {items.length > 0 && !editing && (
          <motion.div className="dump__foot" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <button className="add-line" onMouseDown={keepFocus} onClick={() => startDraft()}>
              <span className="prompt-glyph">›</span> type anywhere to add more
            </button>
            {unsorted > 0 && (
              <button className="cta" onMouseDown={keepFocus} onClick={() => setMode('sort')}>
                Sort {unsorted} {unsorted === 1 ? 'thought' : 'thoughts'}
                <Kbd k="shift+2" size="xs" />
              </button>
            )}
          </motion.div>
        )}
      </div>
    </div>
  )
}
