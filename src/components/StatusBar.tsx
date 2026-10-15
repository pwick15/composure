import { todayKey } from '../lib/dates'
import { live, resolvePlanCursor, resolveSortCursor } from '../lib/selectors'
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

function hintsFor(s: State): Hint[] {
  if (s.mode === 'dump') {
    if (s.editing)
      return [
        h('enter', 'next'),
        h(['tab', 'shift+tab'], 'nest'),
        h('alt+enter', 'subtask'),
        h('⇧ ⇧', 'done', true),
        h(['up', 'down'], 'move'),
        h('backspace', 'empty: step back'),
      ]
    if (s.selectedId)
      return [
        h('enter', 'edit'),
        h('alt+enter', 'subtask'),
        h(['tab', 'shift+tab'], 'nest'),
        h('backspace', 'delete'),
        h(['shift+up', 'shift+down'], 'reorder'),
        h('mod+enter', 'done'),
        h('escape', 'deselect'),
      ]
    return [
      h('a–z', 'type to add', true),
      h(['up', 'down'], 'select'),
      h('alt+right', 'next screen'),
      h('mod+k', 'search'),
      h('?', 'shortcuts'),
    ]
  }

  if (s.mode === 'today') {
    if (s.todayAdd)
      return s.todayAdd.cursor
        ? [
            h(['left', 'right'], 'option'),
            h(['up', 'down'], 'row'),
            h('enter', 'pick'),
            h('shift+enter', 'add'),
            h('backspace', 'back to text'),
          ]
        : [h('enter', 'add'), h('down', 'options'), h('⇧ ⇧', 'done', true), h('escape', 'close')]
    if (s.run?.phase === 'over')
      return [
        h('x', 'done'),
        h(['-', '='], 'time needed'),
        h('enter', 'carry on'),
        h(['up', 'down'], 'move'),
        h('f', 'stop'),
      ]
    if (s.run)
      return [h('x', 'done, next'), h(['-', '='], 'more / less time'), h(['up', 'down'], 'move'), h('f', 'stop session')]
    return [
      h('f', 'start session'),
      h('n', 'add'),
      h(['up', 'down'], 'move'),
      h('x', 'done'),
      h(['shift+left', 'shift+right'], 'session'),
      h(['-', '='], 'time'),
      h('t', 'not today'),
    ]
  }

  if (s.mode === 'archive')
    return [h('x', 'reopen'), h('mod+backspace', 'delete'), h(['up', 'down'], 'move'), h('shift+4', 'today')]

  if (s.trayEditing) return [h('enter', 'save'), h('escape', 'cancel')]

  if (s.mode === 'sort') {
    if (!resolveSortCursor(s.items, s.decks.sort.cursor, todayKey()))
      return [h('shift+3', 'plan'), h('backspace', 'back'), h(['up', 'down'], 'revisit'), h('mod+k', 'search')]
    return [
      h(['q', 'w', 'a', 's'], 'file'),
      h('1–6', 'time', true),
      h(['up', 'down'], 'move'),
      h(['left', 'right'], 'quadrant'),
      h('⇧ + arrows', 'move it', true),
      h('backspace', 'back'),
      h('e', 'edit'),
      h('x', 'done'),
    ]
  }

  if (!resolvePlanCursor(s.items, s.decks.plan.cursor, todayKey()))
    return [h('mod+k', 'export: search "copy" or "calendar"'), h('backspace', 'back'), h(['up', 'down'], 'revisit')]
  return [
    h('1–7', 'day', true),
    h('8', 'later'),
    h('0', 'unplan'),
    h(['-', '='], 'time'),
    h(['up', 'down'], 'move'),
    h(['left', 'right'], 'days'),
    h('⇧ + arrows', 'move it', true),
    h('backspace', 'back'),
    h('x', 'done'),
  ]
}

const MODE_LABEL = { dump: 'DUMP', sort: 'SORT', plan: 'PLAN', today: 'TODAY', archive: 'ARCHIVE' }

export function StatusBar() {
  const state = useStore()
  const hints = hintsFor(state)
  const thoughts = live(state.items, todayKey()).length
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
