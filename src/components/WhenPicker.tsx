import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { pulse } from '../keyboard/feedback'
import { comboId, eventCombo, isMac } from '../keyboard/keys'
import { todayKey } from '../lib/dates'
import { SNAP } from '../lib/motion'
import { whenOptions } from '../lib/when'
import { truncate, whenApply, whenClose } from '../state/actions'
import { useStore } from '../state/store'
import { Kbd } from './Kbd'

function Picker({ text, current }: { text: string; current: string | null }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const today = todayKey()
  const options = useMemo(() => whenOptions(query, today, current), [query, today, current])

  useLayoutEffect(() => {
    input.current?.focus()
  }, [])

  // Past the end of a shrinking list, stay on the last option.
  const at = Math.min(active, Math.max(0, options.length - 1))
  useEffect(() => {
    document.querySelector('.when [aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [at])

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const native = e.nativeEvent
    if (native.isComposing) return
    const mod = isMac ? e.metaKey : e.ctrlKey
    const move = (d: number) => {
      e.preventDefault()
      pulse(comboId(eventCombo(native)))
      if (options.length) setActive((at + d + options.length) % options.length)
    }
    if (e.key === 'ArrowDown' || (e.ctrlKey && (e.key === 'n' || e.key === 'j'))) return move(1)
    if (e.key === 'ArrowUp' || (e.ctrlKey && (e.key === 'p' || e.key === 'k'))) return move(-1)
    if (e.key === 'Tab') return move(e.shiftKey ? -1 : 1)
    if (e.key === 'Enter') {
      e.preventDefault()
      pulse(comboId(eventCombo(native)))
      if (options[at]) whenApply(options[at].slot)
      return
    }
    // ⌘S again, like Esc, puts it away. (It would otherwise ask the browser to save the page.)
    if (e.key === 'Escape' || (mod && e.key.toLowerCase() === 's')) {
      e.preventDefault()
      pulse(comboId(eventCombo(native)))
      whenClose()
    }
  }

  return (
    <motion.div
      className="overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.1 }}
      onMouseDown={whenClose}
    >
      <motion.div
        className="palette when"
        role="dialog"
        aria-label="When"
        initial={{ opacity: 0, y: -10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.08 } }}
        transition={SNAP}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="when__task">
          <span className="eyebrow">// when</span>
          <span className="when__text">{truncate(text, 60)}</span>
        </div>
        <div className="palette__input">
          <span className="palette__prompt" aria-hidden>
            ›
          </span>
          <input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="tue · in 2 days · 24/12 · 15 oct · next week"
            role="combobox"
            aria-expanded
            aria-controls="when-list"
            spellCheck={false}
            autoComplete="off"
          />
          <Kbd k="escape" size="xs" />
        </div>

        <div className="palette__list" id="when-list" role="listbox">
          {options.map((o, i) => (
            <div
              key={String(o.slot)}
              role="option"
              aria-selected={i === at}
              className="prow"
              onMouseMove={() => active !== i && setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => whenApply(o.slot)}
            >
              {i === at && <motion.span layoutId="when-bg" className="prow__bg" transition={SNAP} />}
              <span className="prow__glyph">›</span>
              <span className="prow__title">{o.label}</span>
              {o.slot === current && <span className="tag tag--muted">now</span>}
              <span className="prow__hint">{o.hint}</span>
            </div>
          ))}
          {!options.length && (
            <p className="when__none">Nothing matches. Try “tue”, “in 2 days”, “24/12” or “15 oct”.</p>
          )}
        </div>

        <div className="palette__foot">
          <span>
            <Kbd k="up" size="xs" />
            <Kbd k="down" size="xs" /> choose
          </span>
          <span>
            <Kbd k="enter" size="xs" /> set
          </span>
          <span>
            <Kbd k="mod+z" size="xs" /> undo
          </span>
        </div>
      </motion.div>
    </motion.div>
  )
}

export function WhenPicker() {
  const when = useStore((s) => s.when)
  return (
    <AnimatePresence>
      {when && <Picker key={when.ids[0]} text={when.text} current={when.current} />}
    </AnimatePresence>
  )
}
