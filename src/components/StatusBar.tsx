import { todayKey } from '../lib/dates'
import { resolvePlanCursor, resolveSortCursor } from '../lib/selectors'
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
      return [h('enter', 'next'), h('escape', 'done'), h(['up', 'down'], 'move'), h('backspace', 'empty: step back')]
    if (s.selectedId)
      return [
        h('enter', 'edit'),
        h('backspace', 'delete'),
        h(['alt+up', 'alt+down'], 'reorder'),
        h('mod+enter', 'done'),
        h('escape', 'deselect'),
      ]
    return [
      h('a–z', 'type to add', true),
      h(['up', 'down'], 'select'),
      h('shift+2', 'sort'),
      h('mod+k', 'search'),
      h('?', 'shortcuts'),
    ]
  }

  if (s.trayEditing) return [h('enter', 'save'), h('escape', 'cancel')]

  if (s.mode === 'sort') {
    if (!resolveSortCursor(s.items, s.sortCursor)) return [h('shift+3', 'plan'), h(['j', 'k'], 'revise'), h('mod+k', 'search')]
    if (s.sortPending)
      return [
        h('enter', 'confirm'),
        h(['up', 'down', 'left', 'right'], 'adjust'),
        h('escape', 'cancel'),
      ]
    return [
      h(['q', 'w', 'a', 's'], 'choose'),
      h('1–4', 'also works', true),
      h(['j', 'k'], 'skip'),
      h('e', 'edit'),
      h('x', 'done'),
      h('shift+q', 'assign + next'),
    ]
  }

  if (!resolvePlanCursor(s.items, s.planCursor, todayKey()))
    return [h('mod+k', 'export: search "copy" or "calendar"'), h(['j', 'k'], 'revise')]
  if (s.planPending) return [h('enter', 'confirm'), h(['left', 'right'], 'adjust'), h('escape', 'cancel')]
  return [
    h('1–7', 'day', true),
    h('8', 'later'),
    h('0', 'unplan'),
    h(['left', 'right'], 'pick'),
    h(['j', 'k'], 'skip'),
    h('x', 'done'),
  ]
}

const MODE_LABEL = { dump: 'DUMP', sort: 'SORT', plan: 'PLAN' }

export function StatusBar() {
  const state = useStore()
  const hints = hintsFor(state)
  return (
    <footer className="statusbar">
      <span className="statusbar__mode">{MODE_LABEL[state.mode]}</span>
      <div className="statusbar__hints">
        {hints.map((hint) => (
          <span key={hint.label} className="hint">
            <span className="keys">
              {hint.keys.map((k) => (hint.literal ? <Kbd key={k} label={k} size="xs" /> : <Kbd key={k} k={k} size="xs" />))}
            </span>
            {hint.label}
          </span>
        ))}
      </div>
      <div className="statusbar__right">
        <span>
          {state.items.length} {state.items.length === 1 ? 'thought' : 'thoughts'}
        </span>
        <span className="statusbar__local" title="Saved in this browser only. Nothing is sent anywhere.">
          <span className="dot" /> saved locally
        </span>
      </div>
    </footer>
  )
}
