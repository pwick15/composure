import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { COMMANDS, GROUP_ORDER, titleOf, type Command } from '../keyboard/commands'
import { pulse } from '../keyboard/feedback'
import { comboId, eventCombo, isMac } from '../keyboard/keys'
import { todayKey } from '../lib/dates'
import { fuzzyBest, fuzzyMatch } from '../lib/fuzzy'
import { SNAP } from '../lib/motion'
import type { Item, Mode } from '../lib/types'
import { addItems, closePalette, jumpTo, toast, truncate } from '../state/actions'
import { getState, useStore } from '../state/store'
import { Kbd } from './Kbd'
import { QuadrantTag, SlotTag } from './Tags'

type Row =
  | { kind: 'command'; cmd: Command; title: string; indices: number[] }
  | { kind: 'item'; item: Item; indices: number[] }
  | { kind: 'create'; text: string }

interface Section {
  title: string
  rows: Row[]
}

const SECTION_FOR_MODE: Record<Mode, string> = { dump: 'Dump', sort: 'Sort', plan: 'Plan', today: 'Today', archive: 'Archive' }

function available(mode: Mode) {
  return COMMANDS.filter((c) => c.palette !== false && (!c.scope || c.scope === mode))
}

function buildSections(query: string, mode: Mode, items: Item[]): Section[] {
  const cmds = available(mode)
  const q = query.trim()

  if (!q) {
    // Browse mode: every command, grouped, current mode's group first after Modes.
    const order = [...GROUP_ORDER].sort((a, b) => {
      const rank = (g: string) => (g === 'Modes' ? 0 : g === SECTION_FOR_MODE[mode] ? 1 : 2)
      return rank(a) - rank(b)
    })
    return order
      .map((g) => ({
        title: g,
        rows: cmds
          .filter((c) => c.group === g)
          .map((cmd): Row => ({ kind: 'command', cmd, title: titleOf(cmd), indices: [] })),
      }))
      .filter((s) => s.rows.length)
  }

  const commandRows = cmds
    .map((cmd) => {
      const title = titleOf(cmd)
      const m = fuzzyBest(q, title, `${cmd.keywords ?? ''} ${cmd.group}`)
      return m && { row: { kind: 'command', cmd, title, indices: m.indices } as Row, score: m.score }
    })
    .filter((r): r is { row: Row; score: number } => Boolean(r))
    .sort((a, b) => b.score - a.score)
    .slice(0, 7)

  const itemRows = items
    .map((item) => {
      const m = fuzzyMatch(q, item.text)
      return m && { row: { kind: 'item', item, indices: m.indices } as Row, score: m.score }
    })
    .filter((r): r is { row: Row; score: number } => Boolean(r))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)

  const create: Section = { title: 'New', rows: [{ kind: 'create', text: q }] }
  const sections: Section[] = []
  if (commandRows.length) sections.push({ title: 'Commands', rows: commandRows.map((r) => r.row) })
  if (itemRows.length) sections.push({ title: 'Thoughts', rows: itemRows.map((r) => r.row) })
  // Weak or no matches: adding the text as a thought is the likely intent.
  const best = Math.max(commandRows[0]?.score ?? -Infinity, itemRows[0]?.score ?? -Infinity)
  return best < 15 ? [create, ...sections] : [...sections, create]
}

function Highlight({ text, indices }: { text: string; indices: number[] }) {
  if (!indices.length) return <>{text}</>
  const set = new Set(indices)
  const out: ReactNode[] = []
  let run = ''
  let marked = false
  const flush = (i: number) => {
    if (!run) return
    out.push(marked ? <mark key={i}>{run}</mark> : run)
    run = ''
  }
  for (let i = 0; i < text.length; i++) {
    const m = set.has(i)
    if (m !== marked) {
      flush(i)
      marked = m
    }
    run += text[i]
  }
  flush(text.length)
  return <>{out}</>
}

function runRow(row: Row) {
  closePalette()
  if (row.kind === 'command') row.cmd.run()
  else if (row.kind === 'item') jumpTo(row.item.id)
  else {
    addItems(getState().items.at(-1)?.id ?? null, [row.text])
    toast(`Added "${truncate(row.text)}"`, 'mod+z')
  }
}

function Palette() {
  const seed = useStore((s) => s.palette.seed)
  const open = useStore((s) => s.palette.open)
  const mode = useStore((s) => s.mode)
  const items = useStore((s) => s.items)
  const [query, setQuery] = useState(seed)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const today = todayKey()

  useLayoutEffect(() => {
    const el = input.current!
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  // While the exit animation plays, give the keyboard back to the app.
  useLayoutEffect(() => {
    if (!open) input.current?.blur()
  }, [open])

  const sections = useMemo(() => buildSections(query, mode, items), [query, mode, items])
  const rows = useMemo(() => sections.flatMap((s) => s.rows), [sections])

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const native = e.nativeEvent
    if (native.isComposing || !open) return
    const mod = isMac ? e.metaKey : e.ctrlKey
    const move = (d: number) => {
      e.preventDefault()
      pulse(comboId(eventCombo(native)))
      if (rows.length) setActive((i) => (i + d + rows.length) % rows.length)
    }
    if (e.key === 'ArrowDown' || (e.ctrlKey && (e.key === 'n' || e.key === 'j'))) return move(1)
    if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) return move(-1)
    if (e.key === 'Tab') return move(e.shiftKey ? -1 : 1)
    if (e.key === 'Enter') {
      e.preventDefault()
      pulse(comboId(eventCombo(native)))
      if (mod && query.trim()) return runRow({ kind: 'create', text: query.trim() })
      const row = rows[active]
      if (row) runRow(row)
      return
    }
    if (e.key === 'Escape' || (mod && e.key.toLowerCase() === 'k') || (e.key === 'Backspace' && !query)) {
      e.preventDefault()
      pulse(comboId(eventCombo(native)))
      closePalette()
    }
  }

  let index = -1
  return (
    <motion.div
      className="overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.1 }}
      onMouseDown={closePalette}
    >
      <motion.div
        className="palette"
        role="dialog"
        aria-label="Search"
        initial={{ opacity: 0, y: -10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.08 } }}
        transition={SNAP}
        onMouseDown={(e) => e.stopPropagation()}
      >
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
            placeholder="Search commands, shortcuts and thoughts…"
            role="combobox"
            aria-expanded
            aria-controls="palette-list"
            aria-activedescendant={`prow-${active}`}
            spellCheck={false}
            autoComplete="off"
          />
          <Kbd k="escape" size="xs" />
        </div>

        <div className="palette__list" id="palette-list" role="listbox" ref={list}>
          {sections.map((section) => (
            <div key={section.title} role="group" aria-label={section.title}>
              <div className="palette__section">{section.title}</div>
              {section.rows.map((row) => {
                const i = ++index
                const selected = i === active
                return (
                  <div
                    key={row.kind === 'command' ? row.cmd.id : row.kind === 'item' ? row.item.id : 'create'}
                    id={`prow-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={selected}
                    className="prow"
                    onMouseMove={() => active !== i && setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => runRow(row)}
                  >
                    {selected && <motion.span layoutId="prow-bg" className="prow__bg" transition={SNAP} />}
                    {row.kind === 'command' && (
                      <>
                        <span className="prow__glyph">›</span>
                        <span className="prow__title">
                          <Highlight text={row.title} indices={row.indices} />
                        </span>
                        <span className="prow__keys">
                          {row.cmd.keys?.slice(0, 2).map((k) => <Kbd key={k} k={k} size="xs" />)}
                        </span>
                      </>
                    )}
                    {row.kind === 'item' && (
                      <>
                        <span className="prow__glyph prow__glyph--dot" data-q={row.item.quadrant ?? 'none'} />
                        <span className="prow__title" data-done={row.item.done || undefined}>
                          <Highlight text={row.item.text} indices={row.indices} />
                        </span>
                        <span className="prow__keys">
                          <QuadrantTag item={row.item} />
                          <SlotTag item={row.item} today={today} />
                        </span>
                      </>
                    )}
                    {row.kind === 'create' && (
                      <>
                        <span className="prow__glyph prow__glyph--accent">+</span>
                        <span className="prow__title">
                          Add "{row.text}" as a thought
                        </span>
                        <span className="prow__keys">
                          <Kbd k="mod+enter" size="xs" />
                        </span>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <div className="palette__foot">
          <span>
            <Kbd k="up" size="xs" />
            <Kbd k="down" size="xs" /> navigate
          </span>
          <span>
            <Kbd k="enter" size="xs" /> run
          </span>
          <span>
            <Kbd k="mod+enter" size="xs" /> add as thought
          </span>
          <span className="palette__foot-right">
            <Kbd k="?" size="xs" /> all shortcuts
          </span>
        </div>
      </motion.div>
    </motion.div>
  )
}

export function CommandPalette() {
  const open = useStore((s) => s.palette.open)
  const nonce = useStore((s) => s.palette.nonce)
  return <AnimatePresence>{open && <Palette key={nonce} />}</AnimatePresence>
}
