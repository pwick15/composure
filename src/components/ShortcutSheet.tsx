import { AnimatePresence, motion } from 'motion/react'
import { COMMANDS, GROUP_ORDER, SHEET_HINTS, titleOf } from '../keyboard/commands'
import { SNAP } from '../lib/motion'
import { toggleHelp } from '../state/actions'
import { useStore } from '../state/store'
import { Kbd } from './Kbd'

interface SheetRow {
  title: string
  keys: string[]
  literal?: boolean
}

function rowsFor(group: string): SheetRow[] {
  const fromCommands = COMMANDS.filter((c) => c.group === group && c.keys?.length && c.sheet !== false).map((c) => ({
    title: titleOf(c),
    keys: c.keys!,
  }))
  const hints = SHEET_HINTS.filter((h) => h.group === group)
  return [...hints, ...fromCommands]
}

function Sheet() {
  const groups = GROUP_ORDER.map((g) => ({ g, rows: rowsFor(g) })).filter((x) => x.rows.length)
  return (
    <motion.div
      className="overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.1 }}
      onMouseDown={toggleHelp}
    >
      <motion.div
        className="sheet"
        role="dialog"
        aria-label="Keyboard shortcuts"
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.98, transition: { duration: 0.08 } }}
        transition={SNAP}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="sheet__head">
          <div>
            <div className="eyebrow">// keyboard</div>
            <h2>Everything has a key</h2>
            <p>
              Can't remember one? <Kbd k="mod+f" size="xs" /> searches every command by name.
            </p>
          </div>
          <Kbd k="escape" size="md" />
        </header>
        <div className="sheet__grid">
          {groups.map(({ g, rows }) => (
            <section key={g} className="sheet__group">
              <h3 className="eyebrow">{g}</h3>
              {rows.map((r) => (
                <div key={r.title} className="sheet__row">
                  <span>{r.title}</span>
                  <span className="keys">
                    {r.keys.map((k) => (r.literal ? <Kbd key={k} label={k} size="xs" /> : <Kbd key={k} k={k} size="xs" />))}
                  </span>
                </div>
              ))}
            </section>
          ))}
          <section className="sheet__group">
            <h3 className="eyebrow">Export · Data · Settings</h3>
            <p className="sheet__note">
              Copying your plan, downloading a calendar file, sending to Things 3, backups and themes all live in
              search. Press <Kbd k="mod+f" size="xs" /> and type what you want.
            </p>
          </section>
        </div>
      </motion.div>
    </motion.div>
  )
}

export function ShortcutSheet() {
  const open = useStore((s) => s.helpOpen)
  return <AnimatePresence>{open && <Sheet />}</AnimatePresence>
}
