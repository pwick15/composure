import { AnimatePresence, motion } from 'motion/react'
import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { feedback } from '../keyboard/feedback'
import { isMac } from '../keyboard/keys'
import { isDateSlot, isOverdue, lateLabel, longDate, slotLabel } from '../lib/dates'
import { autosize } from '../lib/dom'
import { fmt } from '../lib/duration'
import { FIELD_LABEL, type Field, type FieldOption } from '../lib/fields'
import { keepFocus, SNAP } from '../lib/motion'
import { QUADRANT_BY_ID } from '../lib/quadrants'
import type { Item } from '../lib/types'
import * as a from '../state/actions'
import { useStore, type Sheet } from '../state/store'
import { Kbd } from './Kbd'

/** How a row's current value reads at its end: "Fri 23 Oct", "~45m", "mixed". */
function valueLabel(sheet: Sheet, row: Exclude<Field, 'text'>, today: string): string {
  const value = a.sheetValue(sheet, row)
  if (value === undefined) return 'mixed'
  if (row === 'quadrant') return value ? QUADRANT_BY_ID[value as Item['quadrant'] & string].title : 'unsorted'
  if (row === 'slot') {
    const slot = value as string | null
    if (!slot) return 'no day'
    if (isOverdue(slot, today)) return `${longDate(slot)} · ${lateLabel(slot, today)}`
    return isDateSlot(slot) ? longDate(slot) : slotLabel(slot, today)
  }
  if (row === 'minutes') return value ? `~${fmt(value as number)}` : 'no time'
  return a.sessionName(value as number)
}

/** One line about where the thought sits: its parent, its subtasks, or the ones picked together. */
function Context({ sheet, items }: { sheet: Sheet; items: Item[] }) {
  const subjects = sheet.ids.map((id) => items.find((i) => i.id === id)).filter((i): i is Item => Boolean(i))
  if (subjects.length > 1) {
    return <span className="tsheet__context">{subjects.map((i) => a.truncate(i.text, 22)).join(' · ')}</span>
  }
  const [item] = subjects
  if (!item) return null
  const parent = item.parentId ? items.find((i) => i.id === item.parentId) : undefined
  if (parent) return <span className="tsheet__context">↳ part of {a.truncate(parent.text, 40)}</span>
  const kids = items.filter((i) => i.parentId === item.id)
  if (kids.length) {
    const open = kids.filter((k) => !k.done).length
    return (
      <span className="tsheet__context">
        {kids.length} subtasks, {open} open · changes apply to the open ones
      </span>
    )
  }
  if (item.done) return <span className="tsheet__context">done · <Kbd k="mod+k" size="xs" /> reopens</span>
  return null
}

function Row({ sheet, row, children, value, onValue }: { sheet: Sheet; row: Field; children: ReactNode; value?: string; onValue?: () => void }) {
  return (
    <div className="tsheet__row" data-row={row} data-active={sheet.row === row || undefined}>
      <button type="button" className="tsheet__label" tabIndex={-1} onMouseDown={keepFocus} onClick={() => a.sheetGo(row)}>
        {FIELD_LABEL[row]}
      </button>
      <div className="tsheet__body">{children}</div>
      {value !== undefined &&
        (onValue ? (
          <button type="button" className="tsheet__value" tabIndex={-1} title="Type a day" onMouseDown={keepFocus} onClick={onValue}>
            {value} ✎
          </button>
        ) : (
          <span className="tsheet__value">{value}</span>
        ))}
    </div>
  )
}

function Options({ sheet, row }: { sheet: Sheet; row: Field }) {
  const options = a.sheetOptions(sheet, row)
  const active = sheet.row === row
  return (
    <>
      {options.map((o: FieldOption, i) => (
        <button
          key={`${o.n}:${o.label}`}
          type="button"
          tabIndex={-1}
          className="attr"
          data-q={o.q}
          data-on={a.isCurrentOption(sheet, row, o) || undefined}
          data-cursor={(active && i === sheet.col) || undefined}
          title={o.hint}
          onMouseDown={keepFocus}
          onClick={() => a.sheetChoose(row, o)}
        >
          <span className="attr__n">{o.n}</span>
          {o.label}
        </button>
      ))}
    </>
  )
}

function Panel({ sheet }: { sheet: Sheet }) {
  const items = useStore((s) => s.items)
  const today = useStore((s) => s.today)
  const root = useRef<HTMLDivElement>(null)
  const text = useRef<HTMLTextAreaElement>(null)
  const day = useRef<HTMLInputElement>(null)
  const rows = a.sheetRows(sheet)
  const subject = items.find((i) => i.id === sheet.ids[0])
  const typing = sheet.query !== null

  // The keyboard follows the active row: the text box, the day box while typing one, else the sheet.
  useLayoutEffect(() => {
    if (sheet.row === 'text' && text.current) {
      const el = text.current
      if (document.activeElement === el) return
      el.focus({ preventScroll: true })
      el.setSelectionRange(el.value.length, el.value.length)
      autosize(el)
    } else if (typing && day.current) {
      const el = day.current
      el.focus({ preventScroll: true })
      el.setSelectionRange(el.value.length, el.value.length)
    } else {
      root.current?.focus({ preventScroll: true })
    }
  }, [sheet.row, typing])

  const saveText = () => {
    if (text.current) a.sheetSetText(text.current.value)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const native = e.nativeEvent
    if (native.isComposing) return
    const mod = isMac ? e.metaKey : e.ctrlKey
    const plain = !mod && !e.altKey && !e.ctrlKey
    const inText = e.target === text.current
    const inDay = e.target === day.current
    const act = (label: string, fn: () => void) => {
      e.preventDefault()
      feedback(native, label)
      flushSync(fn)
    }
    const { key, code } = e

    // The keys that work everywhere work here too, on what the sheet shows.
    if (key === 'Escape' || (mod && code === 'KeyE') || (mod && key === 'Enter')) {
      return act('Close', () => {
        saveText()
        a.sheetClose()
      })
    }
    if (mod && code === 'KeyZ') return act(e.shiftKey ? 'Redo' : 'Undo', e.shiftKey ? a.redo : a.undo)
    if (mod && code === 'KeyY') return act('Redo', a.redo)
    if (mod && code === 'KeyK') {
      return act(subject?.done ? 'Reopen' : 'Done', () => {
        saveText()
        a.sheetDone()
      })
    }
    if (mod && key === 'Backspace') return act('Delete', a.sheetDelete)
    if (mod && code === 'KeyS') {
      return act('Day', () => {
        saveText()
        if (typing) a.sheetClose()
        else a.sheetType('')
      })
    }
    if (mod && code === 'KeyF') {
      return act('Search', () => {
        saveText()
        a.sheetClose()
        a.openPalette()
      })
    }
    if (key === 'Tab') {
      return act(e.shiftKey ? 'Up' : 'Down', () => {
        saveText()
        a.sheetRow(e.shiftKey ? -1 : 1)
      })
    }

    if (inText) {
      const el = text.current!
      if (key === 'Enter' && !e.shiftKey) {
        return act('Saved', () => {
          a.sheetSetText(el.value)
          a.sheetClose()
        })
      }
      if ((key === 'ArrowDown' || key === 'ArrowUp') && plain && !e.shiftKey && el.selectionStart === el.selectionEnd) {
        const down = key === 'ArrowDown'
        if (down ? el.selectionEnd === el.value.length : el.selectionStart === 0) {
          return act(down ? 'Down' : 'Up', () => {
            a.sheetSetText(el.value)
            a.sheetRow(down ? 1 : -1)
          })
        }
      }
      return // typing
    }

    if (inDay) {
      if (key === 'ArrowDown' || key === 'ArrowUp') return act('Choose', () => a.sheetCol(key === 'ArrowDown' ? 1 : -1))
      if (key === 'Enter') return act('Set', a.sheetEnter)
      if (key === 'Backspace' && !day.current!.value) return act('Back', () => a.sheetType(null))
      return // typing
    }

    if (key === 'ArrowUp' || key === 'ArrowDown') return act(key === 'ArrowUp' ? 'Up' : 'Down', () => a.sheetRow(key === 'ArrowUp' ? -1 : 1))
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      return act(key === 'ArrowLeft' ? '← Option' : 'Option →', () => a.sheetCol(key === 'ArrowLeft' ? -1 : 1))
    }
    if (key === 'Enter') return act('Pick', a.sheetEnter)
    if (key === 'Backspace') return act('Close', a.sheetClose)
    const digit = /^(?:Digit|Numpad)(\d)$/.exec(code)
    // ⌥1–⌥6 set the time from any row, as they do on every screen.
    if (digit && e.altKey && !mod && Number(digit[1]) >= 1 && Number(digit[1]) <= 6) {
      const n = Number(digit[1])
      return act(`~${a.sheetOptions(sheet, 'minutes')[n - 1].label}`, () => a.sheetTime(n))
    }
    if (digit && plain && !e.shiftKey) {
      const n = Number(digit[1])
      const option = a.sheetOptions(sheet, sheet.row).find((o) => o.n === n)
      return act(n === 0 ? 'Clear' : (option?.label ?? String(n)), () => a.sheetPick(n))
    }
    if ((key === '-' || key === '=' || key === '+') && plain) return act(key === '-' ? 'Shorter' : 'Longer', () => a.sheetNudge(key === '-' ? -1 : 1))
    // Typing a letter anywhere on the sheet reads it as a day: "fri", "next week".
    if (key.length === 1 && /[a-z+]/i.test(key) && plain) return act('Day', () => a.sheetType(key))
  }

  const readings = typing ? a.sheetReadings(sheet) : []

  return (
    <motion.div
      className="overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.1 }}
      onMouseDown={() => {
        saveText()
        a.sheetClose()
      }}
    >
      <motion.div
        ref={root}
        className="palette tsheet"
        role="dialog"
        aria-label="Thought"
        tabIndex={-1}
        initial={{ opacity: 0, y: -10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.08 } }}
        transition={SNAP}
        onKeyDown={onKeyDown}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="tsheet__head">
          <span className="eyebrow">{sheet.ids.length > 1 ? `// ${sheet.ids.length} thoughts` : '// thought'}</span>
          <Context sheet={sheet} items={items} />
          <Kbd k="escape" size="xs" />
        </header>

        <div className="tsheet__rows">
          {rows.includes('text') && subject && (
            <Row sheet={sheet} row="text">
              <textarea
                key={sheet.nonce}
                ref={text}
                className="tsheet__text"
                defaultValue={subject.text}
                rows={1}
                aria-label="Text"
                spellCheck
                onInput={(e) => autosize(e.currentTarget)}
                onFocus={() => sheet.row !== 'text' && a.sheetGo('text')}
                onBlur={(e) => a.sheetSetText(e.currentTarget.value)}
              />
            </Row>
          )}
          {rows.includes('quadrant') && (
            <Row sheet={sheet} row="quadrant" value={valueLabel(sheet, 'quadrant', today)}>
              <Options sheet={sheet} row="quadrant" />
            </Row>
          )}
          {rows.includes('slot') && (
            <Row sheet={sheet} row="slot" value={typing ? undefined : valueLabel(sheet, 'slot', today)} onValue={() => a.sheetType('')}>
              {typing ? (
                <div className="tsheet__typed">
                  <input
                    ref={day}
                    className="tsheet__input"
                    value={sheet.query ?? ''}
                    placeholder="tue · in 2 days · 24/12 · 15 oct · next week"
                    aria-label="Day"
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(e) => a.sheetType(e.target.value)}
                  />
                  <div className="tsheet__readings">
                    {readings.map((r, i) => (
                      <button
                        key={String(r.slot)}
                        type="button"
                        tabIndex={-1}
                        className="attr"
                        data-cursor={i === sheet.col || undefined}
                        onMouseDown={keepFocus}
                        onClick={() => a.sheetChoose('slot', { n: 0, label: r.label, hint: r.hint, change: { slot: r.slot } })}
                      >
                        {r.label}
                        <span className="attr__hint">{r.hint}</span>
                      </button>
                    ))}
                    {!readings.length && <span className="tsheet__none">Nothing matches. Try "tue", "in 2 days", "24/12".</span>}
                  </div>
                </div>
              ) : (
                <Options sheet={sheet} row="slot" />
              )}
            </Row>
          )}
          {rows.includes('minutes') && (
            <Row sheet={sheet} row="minutes" value={valueLabel(sheet, 'minutes', today)}>
              <Options sheet={sheet} row="minutes" />
            </Row>
          )}
          {rows.includes('session') && (
            <Row sheet={sheet} row="session" value={valueLabel(sheet, 'session', today)}>
              <Options sheet={sheet} row="session" />
            </Row>
          )}
        </div>

        <footer className="palette__foot tsheet__foot">
          {sheet.receipt ? (
            <span className="tsheet__receipt">
              {sheet.receipt} <Kbd k="mod+z" size="xs" /> undo
            </span>
          ) : (
            <>
              <span>
                <Kbd k="up" size="xs" />
                <Kbd k="down" size="xs" /> row
              </span>
              <span>
                <Kbd label="1–8" size="xs" /> pick
              </span>
              <span>
                <Kbd k="0" size="xs" /> clear
              </span>
              <span>
                <Kbd label="a–z" size="xs" /> type a day
              </span>
            </>
          )}
          <span className="palette__foot-right">
            <Kbd k="mod+k" size="xs" /> done <Kbd k="escape" size="xs" /> close
          </span>
        </footer>
      </motion.div>
    </motion.div>
  )
}

/** The thought sheet: ↵ or ⌘E on a thought, on any screen. */
export function ThoughtSheet() {
  const sheet = useStore((s) => s.sheet)
  return <AnimatePresence>{sheet && <Panel key={sheet.nonce} sheet={sheet} />}</AnimatePresence>
}
