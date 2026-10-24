import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { COMMANDS, GROUP_ORDER, inWorkMode, SHEET_HINTS, titleOf } from '../keyboard/commands'
import { keepFocus, SNAP } from '../lib/motion'
import type { Mode } from '../lib/types'
import { helpTab, setMode, toggleHelp } from '../state/actions'
import { useStore } from '../state/store'
import { Kbd } from './Kbd'

// ? opens two pages: how the app works (the core features, in the order you use them), and every key.

const go = (mode: Mode) => () => {
  toggleHelp()
  setMode(mode)
}

interface CardProps {
  name: string
  title: string
  /** The key that takes you there, or that starts it. */
  k: string
  /** Where the key takes you, when it's a screen. */
  mode?: Mode
  children: ReactNode
}

function Card({ name, title, k, mode, children }: CardProps) {
  return (
    <li className="guide__card" data-mode={mode}>
      <header className="guide__head">
        <span className="guide__name">{name}</span>
        {mode ? (
          <button type="button" className="guide__go" title={`Go to ${name}`} onMouseDown={keepFocus} onClick={go(mode)}>
            <Kbd k={k} size="xs" />
          </button>
        ) : (
          <Kbd k={k} size="xs" />
        )}
      </header>
      <h3 className="guide__title">{title}</h3>
      {children}
    </li>
  )
}

/** The guide while sessions mode is on: paste, size, work, send back. */
function SessionsGuide() {
  return (
    <div className="guide">
      <p className="guide__lede">Paste a pile of tasks, size them, work through them in timed sessions, then send them back to Things.</p>
      <ol className="guide__flow">
        <Card name="Paste" title="Bring the list in" k="mod+v">
          <p>
            Paste what you copied from Things. Every line becomes a task for today, and the date Things puts in front is dropped.{' '}
            <Kbd k="space" size="xs" /> adds one by hand.
          </p>
        </Card>
        <Card name="Size" title="Say how long" k="alt+3">
          <p>
            <Kbd label="⌥1–6" size="xs" /> sets the time, <Kbd k="=" size="xs" /> and <Kbd k="-" size="xs" /> nudge it.{' '}
            <Kbd label="1–9" size="xs" /> moves a task to a session, and clicking a session's name names it.
          </p>
        </Card>
        <Card name="Work" title="One thing at a time" k="alt+f">
          <p>
            <Kbd k="alt+f" size="xs" /> starts the session. Each task gets its estimate and one clock counts down the session.{' '}
            <Kbd k="mod+k" size="xs" /> ticks a task off. <Kbd k="alt+p" size="xs" /> is for something that came up.
          </p>
        </Card>
        <Card name="Send" title="Back to Things" k="alt+s">
          <p>
            <Kbd k="alt+s" size="xs" /> sends this session and <Kbd k="alt+shift+s" size="xs" /> every session. Ticked tasks go in
            as done (they show in the Logbook), the rest open in the Inbox. Things asks once to allow links.
          </p>
          <p>
            Tasks stay here until you press <Kbd k="alt+enter" size="xs" /> to say they arrived. If the link fails, search "copy"
            for the Markdown route.
          </p>
        </Card>
      </ol>
      <p className="guide__rule">
        <Kbd k="mod+z" size="xs" /> undoes anything. Letters always type: search for "mode" to bring back the full app.
      </p>
    </div>
  )
}

function Guide() {
  const sessions = useStore((s) => s.workMode === 'sessions')
  if (sessions) return <SessionsGuide />
  return (
    <div className="guide">
      <p className="guide__lede">
        Empty your head, decide what matters, give it a day, then do one thing at a time. Four screens, in that order.
      </p>
      <ol className="guide__flow">
        <Card name="Dump" title="Empty your head" k="shift+1" mode="dump">
          <p>
            <Kbd k="space" size="xs" /> starts a thought and <Kbd k="enter" size="xs" /> the next. Paste a list and each line
            becomes a thought.
          </p>
          <p>
            <Kbd k="tab" size="xs" /> tucks a line under the one above as a subtask.
          </p>
          <p>
            Once a thought has a lane, a day and a time, Dump puts it away. <Kbd k="right" size="xs" /> asks for whatever is
            missing.
          </p>
        </Card>
        <Card name="Sort" title="Decide what matters" k="shift+2" mode="sort">
          <p>
            One thought at a time goes into a lane: <Kbd k="1" size="xs" /> Do, what you chose to do;{' '}
            <Kbd k="2" size="xs" /> Admin, what you have to do to keep life running; <Kbd k="3" size="xs" /> 2-minute, quicker
            to do than to plan.
          </p>
          <p>
            Once everything's sorted, the card walks you through the 2-minute ones: do it, then <Kbd k="mod+k" size="xs" />.
          </p>
          <p>
            <Kbd k="space" size="xs" /> skips one. <Kbd k="backspace" size="xs" /> brings back the last one you filed.
          </p>
        </Card>
        <Card name="Plan" title="Give it a day" k="shift+3" mode="plan">
          <p>
            <Kbd label="1–7" size="xs" /> put it on one of the next seven days, <Kbd k="8" size="xs" /> on later,{' '}
            <Kbd k="0" size="xs" /> takes the day off.
          </p>
          <p>Each day shows how much time it holds. A day split into sessions shows them by name.</p>
        </Card>
        <Card name="Today" title="Do one thing at a time" k="shift+4" mode="today">
          <p>Today's plan, plus anything late, in work sessions. Click a session's name to name it.</p>
          <p>
            <Kbd k="alt+m" size="xs" /> makes a task today's main thing: the hard one that would make the day count. It goes to
            the top.
          </p>
          <p>
            <Kbd k="mod+k" size="xs" /> ticks a task off, <Kbd k="alt+t" size="xs" /> moves it to tomorrow,{' '}
            <Kbd k="space" size="xs" /> adds one, <Kbd label="1–9" size="xs" /> moves it to a session.
          </p>
          <p>
            <Kbd k="alt+s" size="xs" /> sends the session to Things 3: ticked tasks as done, the rest open.
          </p>
        </Card>
      </ol>

      <ul className="guide__more">
        <Card name="The thought" title="Change anything, from anywhere" k="enter">
          <p>
            <Kbd k="enter" size="xs" /> or <Kbd k="mod+e" size="xs" /> opens a thought's text, lane, day, time and session
            in one place, on every screen.
          </p>
          <p>
            The numbers pick. Type a day the way you'd say it: "next fri", "in 2 weeks", "24/12". <Kbd k="mod+s" size="xs" />{' '}
            goes straight to the day.
          </p>
          <p>
            <Kbd k="shift+up" size="xs" />
            <Kbd k="shift+down" size="xs" /> pick several, and the sheet changes them all. Click any tag to change just that.
          </p>
        </Card>
        <Card name="Focus" title="Work through a session" k="alt+f">
          <p>
            <Kbd k="alt+f" size="xs" /> starts the selected task's session. Each task gets its estimate, and one clock counts down
            the session, in the browser tab too.
          </p>
          <p>
            When something comes up, <Kbd k="alt+p" size="xs" /> holds the task's clock until you're back.{' '}
            <Kbd k="=" size="xs" /> gives the task more time.
          </p>
        </Card>
        <Card name="Safety" title="Nothing gets lost" k="mod+z">
          <p>
            <Kbd k="mod+z" size="xs" /> undoes anything. Finished thoughts wait in the Archive (<Kbd k="shift+5" size="xs" />), and{' '}
            <Kbd k="mod+k" size="xs" /> there reopens one.
          </p>
          <p>Type any letter to search every thought and command.</p>
          <p>
            Everything stays in this browser. <Kbd k="mod+shift+s" size="xs" /> saves a backup and <Kbd k="mod+o" size="xs" />{' '}
            loads one.
          </p>
        </Card>
      </ul>

      <p className="guide__rule">
        Letters always type. Digits, arrows and <Kbd label="⌘" size="xs" /> <Kbd label="⌥" size="xs" /> chords do things.
      </p>
    </div>
  )
}

interface KeyRow {
  title: string
  keys: string[]
  literal?: boolean
}

function rowsFor(group: string): KeyRow[] {
  const fromCommands = COMMANDS.filter((c) => c.group === group && c.keys?.length && c.sheet !== false && inWorkMode(c)).map((c) => ({
    title: titleOf(c),
    keys: c.keys!,
  }))
  const hints = SHEET_HINTS.filter((h) => h.group === group)
  return [...hints, ...fromCommands]
}

function Keys() {
  const groups = GROUP_ORDER.map((g) => ({ g, rows: rowsFor(g) })).filter((x) => x.rows.length)
  return (
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
          Copying your plan, a calendar file, sending to Things 3, backups and themes all live in search. Press{' '}
          <Kbd k="mod+f" size="xs" /> and type what you want.
        </p>
      </section>
    </div>
  )
}

function Panel() {
  const tab = useStore((s) => s.helpTab)
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
        className="sheet help"
        role="dialog"
        aria-label={tab === 'guide' ? 'How Composure works' : 'Every key'}
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.98, transition: { duration: 0.08 } }}
        transition={SNAP}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="sheet__head">
          <div>
            <div className="eyebrow">// composure</div>
            <h2>{tab === 'guide' ? 'How it works' : 'Every key'}</h2>
          </div>
          <div className="help__tabs" role="tablist" aria-label="Help">
            {(['guide', 'keys'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                className="help__tab"
                data-active={tab === t || undefined}
                onMouseDown={keepFocus}
                onClick={() => helpTab(t)}
              >
                {t === 'guide' ? 'How it works' : 'Keys'}
              </button>
            ))}
            <span className="help__switch">
              <Kbd k="left" size="xs" />
              <Kbd k="right" size="xs" />
            </span>
          </div>
          <Kbd k="escape" size="md" />
        </header>
        {tab === 'guide' ? <Guide /> : <Keys />}
      </motion.div>
    </motion.div>
  )
}

/** ? on any screen: how the app works, and every key. */
export function Help() {
  const open = useStore((s) => s.helpOpen)
  return <AnimatePresence>{open && <Panel />}</AnimatePresence>
}
