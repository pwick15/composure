import { live, resolvePlanCursor, resolveSortCursor, sortGroups } from '../lib/selectors'
import { toggleHelp } from '../state/actions'
import { keepFocus } from '../lib/motion'
import { useStore, type State } from '../state/store'
import { Kbd } from './Kbd'

interface Hint {
  keys: string[]
  label: string
  literal?: boolean
}

const h = (keys: string | string[], label: string, literal = false): Hint => ({
  keys: Array.isArray(keys) ? keys : [keys],
  label,
  literal,
})

/** The handful of keys that matter right now. Everything else is one ? away. */
function hintsFor(s: State): Hint[] {
  if (s.sheet) {
    if (s.sheet.row === 'text') return [h('enter', 'save'), h(['up', 'down'], 'row'), h('mod+k', 'done'), h('escape', 'close')]
    if (s.sheet.query !== null) return [h(['up', 'down'], 'choose'), h('enter', 'set'), h('backspace', 'empty: numbers again'), h('escape', 'close')]
    return [h('1–8', 'pick', true), h('0', 'clear'), h(['up', 'down'], 'row'), h('a–z', 'type a day', true), h(['-', '='], 'time'), h('escape', 'close')]
  }

  // Several picked (⇧↑/⇧↓): what the keys do to all of them.
  if (s.picked) {
    const all = [h('mod+e', 'open all'), h('mod+k', 'done'), h(['-', '='], 'time'), h('mod+backspace', 'delete'), h('escape', 'just one')]
    if (s.mode === 'today') return [h('1–9', 'session', true), h('alt+t', 'not today'), ...all]
    if (s.mode === 'plan') return [h('1–8', 'day', true), ...all]
    if (s.mode === 'sort') return [h('1–3', 'file', true), ...all]
    return all
  }

  if (s.mode === 'dump') {
    if (s.editing)
      return [h('enter', 'next'), h(['tab', 'shift+tab'], 'nest'), h('alt+enter', 'subtask'), h('⇧ ⇧', 'done', true), h('backspace', 'empty: step back')]
    if (s.selectedId)
      return [h('enter', 'edit'), h('right', 'fill in'), h('mod+e', 'open'), h('alt+enter', 'subtask'), h('shift+down', 'pick several'), h('mod+k', 'done')]
    return [h('space', 'add'), h(['up', 'down'], 'select'), h('a–z', 'search', true), h('alt+right', 'next screen')]
  }

  if (s.mode === 'today') {
    if (s.todayAdd)
      return s.todayAdd.cursor
        ? [h(['left', 'right'], 'option'), h(['up', 'down'], 'row'), h('enter', 'pick'), h('shift+enter', 'add'), h('backspace', 'back to text')]
        : [h('enter', 'add'), h('down', 'options'), h('⇧ ⇧', 'done', true), h('escape', 'close')]
    if (s.run?.phase === 'over') return [h('mod+k', 'done'), h(['-', '='], 'time needed'), h('alt+f', 'carry on'), h('escape', 'stop')]
    if (s.run?.pause) return [h('enter', "I'm back")]
    if (s.pausing) return [h('1–4', 'bathroom · break · call · chore', true), h('enter', 'start typed'), h('escape', 'cancel')]
    if (s.run) return [h('mod+k', 'done, next'), h('=', 'more time'), h('alt+p', 'something came up'), h('alt+f', 'stop')]
    return [h('alt+f', 'start session'), h('alt+m', 'main thing'), h('space', 'add'), h('enter', 'open'), h('mod+k', 'done'), h('1–9', 'session', true), h('alt+t', 'not today')]
  }

  if (s.mode === 'archive') return [h('backspace', 'back'), h('mod+k', 'reopen'), h('enter', 'open'), h('mod+backspace', 'delete')]

  if (s.mode === 'sort') {
    const cursor = resolveSortCursor(s.items, s.decks.sort.cursor)
    if (!cursor) return [h('shift+3', 'plan'), h('backspace', 'back'), h(['up', 'down'], 'revisit')]
    // The 2-minute run: nothing left to sort, so the card is one to do now.
    if (!sortGroups(s.items)[0].length && s.items.find((i) => i.id === cursor)?.quadrant === 'quick')
      return [h('mod+k', 'done, next'), h('space', 'not now'), h('1–3', 'refile', true), h('shift+3', 'plan the rest')]
    return [h('1–3', 'file', true), h('space', 'skip'), h('enter', 'open'), h('⌥1–6', 'time', true), h('backspace', 'back'), h('mod+k', 'done')]
  }

  if (!resolvePlanCursor(s.items, s.decks.plan.cursor, s.today))
    return [h('mod+f', 'export: search "copy" or "calendar"'), h('backspace', 'back'), h(['up', 'down'], 'revisit')]
  return [h('1–7', 'day', true), h('8', 'later'), h('space', 'skip'), h('enter', 'open'), h('backspace', 'back'), h('mod+k', 'done')]
}

const MODE_LABEL = { dump: 'DUMP', sort: 'SORT', plan: 'PLAN', today: 'TODAY', archive: 'ARCHIVE' }

export function StatusBar() {
  const state = useStore()
  const hints = hintsFor(state)
  const thoughts = live(state.items).length
  return (
    <footer className="statusbar">
      <span className="statusbar__mode">{MODE_LABEL[state.mode]}</span>
      <div className="statusbar__hints">
        {hints.map((hint) => (
          <span key={`${hint.keys.join()}:${hint.label}`} className="hint">
            <span className="keys">
              {hint.keys.map((k) => (hint.literal ? <Kbd key={k} label={k} size="xs" /> : <Kbd key={k} k={k} size="xs" />))}
            </span>
            {hint.label}
          </span>
        ))}
        <button type="button" className="hint hint--more" onMouseDown={keepFocus} onClick={toggleHelp}>
          <Kbd k="?" size="xs" /> how it works
        </button>
      </div>
      <div className="statusbar__right">
        <span>
          {thoughts} {thoughts === 1 ? 'thought' : 'thoughts'}
        </span>
        <span className="statusbar__local" title="Saved in this browser only. Nothing is sent anywhere.">
          <span className="dot" /> saved locally
        </span>
      </div>
    </footer>
  )
}
