import { planColumns, todayKey } from '../lib/dates'
import { QUADRANTS } from '../lib/quadrants'
import type { Mode } from '../lib/types'
import * as a from '../state/actions'
import * as x from '../state/exporters'
import { parseCombo, matchCombo } from './keys'

export type Group = 'Modes' | 'General' | 'Dump' | 'Sort' | 'Plan' | 'Today' | 'Export' | 'Data' | 'Settings'

export const GROUP_ORDER: Group[] = ['Modes', 'Dump', 'Sort', 'Plan', 'Today', 'General', 'Export', 'Data', 'Settings']

export interface Command {
  id: string
  title: string | (() => string)
  group: Group
  /** Key specs; the first one is shown as the primary shortcut. */
  keys?: string[]
  /** Short label for the keystroke HUD. Defaults to the title. */
  hud?: string | (() => string)
  keywords?: string
  /** Only active in this mode. Global when omitted. */
  scope?: Mode
  /** Listed in the command palette (default true). */
  palette?: boolean
  /** Listed in the shortcut sheet (default true when it has keys). */
  sheet?: boolean
  /** Still fires while typing in a text field. */
  inInput?: boolean
  /** Fires on key auto-repeat. */
  repeat?: boolean
  run: () => void
}

export const titleOf = (c: Command) => (typeof c.title === 'function' ? c.title() : c.title)

export const hudOf = (c: Command) => (typeof c.hud === 'function' ? c.hud() : (c.hud ?? titleOf(c)))

const dayTitle = (n: number) => () => {
  const col = planColumns(todayKey())[n - 1]
  return col.today || col.label === 'Tomorrow' ? `Plan for ${col.label.toLowerCase()}` : `Plan for ${col.sub}`
}

export const COMMANDS: Command[] = [
  // ------------------------------------------------------------ modes
  {
    id: 'mode.dump',
    title: 'Dump: get it all out',
    hud: 'Dump',
    group: 'Modes',
    keys: ['shift+1'],
    keywords: 'capture brain dump write add new',
    run: () => a.setMode('dump'),
  },
  {
    id: 'mode.sort',
    title: 'Sort: Eisenhower matrix',
    hud: 'Sort',
    group: 'Modes',
    keys: ['shift+2'],
    keywords: 'prioritise prioritize triage urgent important quadrant',
    run: () => a.setMode('sort'),
  },
  {
    id: 'mode.plan',
    title: 'Plan: slot into days',
    hud: 'Plan',
    group: 'Modes',
    keys: ['shift+3'],
    keywords: 'week calendar days schedule today tomorrow',
    run: () => a.setMode('plan'),
  },
  {
    id: 'mode.today',
    title: 'Today: do one thing at a time',
    hud: 'Today',
    group: 'Modes',
    keys: ['shift+4'],
    keywords: 'focus checklist done tick do now',
    run: () => a.setMode('today'),
  },
  {
    id: 'mode.next',
    title: 'Next screen',
    hud: 'Screen →',
    group: 'Modes',
    keys: ['alt+right'],
    palette: false,
    sheet: false,
    run: () => a.cycleMode(1),
  },
  {
    id: 'mode.prev',
    title: 'Previous screen',
    hud: '← Screen',
    group: 'Modes',
    keys: ['alt+left'],
    palette: false,
    sheet: false,
    run: () => a.cycleMode(-1),
  },

  // ------------------------------------------------------------ general
  {
    id: 'palette',
    title: 'Search commands and thoughts',
    hud: 'Search',
    group: 'General',
    keys: ['mod+k'],
    inInput: true,
    palette: false,
    run: () => a.openPalette(),
  },
  {
    id: 'help',
    title: 'Keyboard shortcuts',
    hud: 'Shortcuts',
    group: 'General',
    keys: ['?'],
    keywords: 'help cheatsheet keys hotkeys',
    run: a.toggleHelp,
  },
  { id: 'undo', title: 'Undo', group: 'General', keys: ['mod+z'], repeat: true, run: a.undo },
  { id: 'redo', title: 'Redo', group: 'General', keys: ['mod+shift+z', 'mod+y'], repeat: true, run: a.redo },

  // ------------------------------------------------------------ dump
  {
    id: 'dump.new',
    title: 'New thought',
    hud: 'New',
    group: 'Dump',
    scope: 'dump',
    keys: ['space'],
    keywords: 'add create item task',
    run: () => a.startDraft(),
  },
  { id: 'dump.edit', title: 'Edit selected', hud: 'Edit', group: 'Dump', scope: 'dump', keys: ['enter'], run: a.dumpEnter },
  {
    id: 'dump.up',
    title: 'Select previous',
    hud: 'Up',
    group: 'Dump',
    scope: 'dump',
    keys: ['up'],
    repeat: true,
    palette: false,
    run: () => a.dumpSelect(-1),
  },
  {
    id: 'dump.down',
    title: 'Select next',
    hud: 'Down',
    group: 'Dump',
    scope: 'dump',
    keys: ['down'],
    repeat: true,
    palette: false,
    run: () => a.dumpSelect(1),
  },
  {
    id: 'dump.moveUp',
    title: 'Move selected up',
    hud: 'Move up',
    group: 'Dump',
    scope: 'dump',
    keys: ['shift+up', 'alt+up'],
    repeat: true,
    run: () => a.dumpMove(-1),
  },
  {
    id: 'dump.moveDown',
    title: 'Move selected down',
    hud: 'Move down',
    group: 'Dump',
    scope: 'dump',
    keys: ['shift+down', 'alt+down'],
    repeat: true,
    run: () => a.dumpMove(1),
  },
  {
    id: 'dump.done',
    title: 'Toggle done',
    hud: 'Done',
    group: 'Dump',
    scope: 'dump',
    keys: ['mod+enter'],
    run: a.dumpToggleDone,
  },
  {
    id: 'dump.delete',
    title: 'Delete selected',
    hud: 'Delete',
    group: 'Dump',
    scope: 'dump',
    keys: ['backspace', 'delete'],
    run: a.dumpDelete,
  },
  {
    id: 'dump.escape',
    title: 'Clear selection',
    hud: 'Deselect',
    group: 'Dump',
    scope: 'dump',
    keys: ['escape'],
    palette: false,
    run: a.dumpEscape,
  },

  // ------------------------------------------------------------ sort
  ...QUADRANTS.map(
    (q): Command => ({
      id: `sort.${q.id}`,
      title: `File under ${q.title} (${q.blurb.toLowerCase()})`,
      hud: `→ ${q.title}`,
      group: 'Sort',
      scope: 'sort',
      keys: [q.key],
      run: () => a.deckFile('sort', q.id),
    }),
  ),
  {
    id: 'sort.clear',
    title: 'Back to unsorted',
    hud: 'Unsort',
    group: 'Sort',
    scope: 'sort',
    keys: ['0'],
    run: () => a.deckFile('sort', null),
  },

  // ------------------------------------------------------------ plan
  ...[1, 2, 3, 4, 5, 6, 7].map(
    (n): Command => ({
      id: `plan.day${n}`,
      title: dayTitle(n),
      hud: () => `→ ${planColumns(todayKey())[n - 1].label}`,
      group: 'Plan',
      scope: 'plan',
      keys: [String(n)],
      sheet: false,
      run: () => a.planFileDay(n),
    }),
  ),
  {
    id: 'plan.later',
    title: 'Plan for later (not this week)',
    hud: '→ Later',
    group: 'Plan',
    scope: 'plan',
    keys: ['8'],
    run: () => a.planFileDay(8),
  },
  {
    id: 'plan.clear',
    title: 'Unplan',
    hud: 'Unplan',
    group: 'Plan',
    scope: 'plan',
    keys: ['0'],
    run: () => a.deckFile('plan', null),
  },

  // ------------------------------------------------------------ sort + plan (shared navigation)
  ...(['sort', 'plan'] as const).flatMap((m): Command[] => {
    const group = m === 'sort' ? 'Sort' : 'Plan'
    return [
      {
        id: `${m}.down`,
        title: 'Next in list',
        hud: 'Down',
        group,
        scope: m,
        keys: ['down', 'j'],
        repeat: true,
        palette: false,
        run: () => a.deckMove(m, 1),
      },
      {
        id: `${m}.up`,
        title: 'Previous in list',
        hud: 'Up',
        group,
        scope: m,
        keys: ['up', 'k'],
        repeat: true,
        palette: false,
        run: () => a.deckMove(m, -1),
      },
      {
        id: `${m}.right`,
        title: m === 'sort' ? 'Next quadrant' : 'Next day',
        hud: 'Jump →',
        group,
        scope: m,
        keys: ['right'],
        repeat: true,
        palette: false,
        run: () => a.deckJump(m, 1),
      },
      {
        id: `${m}.left`,
        title: m === 'sort' ? 'Previous quadrant' : 'Previous day',
        hud: '← Jump',
        group,
        scope: m,
        keys: ['left'],
        repeat: true,
        palette: false,
        run: () => a.deckJump(m, -1),
      },
      {
        id: `${m}.back`,
        title: 'Back to the last one filed',
        hud: 'Back',
        group,
        scope: m,
        keys: ['backspace'],
        repeat: true,
        keywords: 'undo mistake oops previous',
        run: () => a.deckBack(m),
      },
      {
        id: `${m}.keep`,
        title: 'Keep as is, next',
        hud: 'Keep',
        group,
        scope: m,
        keys: ['enter'],
        keywords: 'skip',
        run: () => a.deckKeep(m),
      },
      { id: `${m}.edit`, title: 'Edit text', hud: 'Edit', group, scope: m, keys: ['e'], run: a.trayEdit },
      { id: `${m}.done`, title: 'Toggle done', hud: 'Done', group, scope: m, keys: ['x'], run: a.trayToggleDone },
      {
        id: `${m}.delete`,
        title: 'Delete thought',
        hud: 'Delete',
        group,
        scope: m,
        keys: ['mod+backspace'],
        run: a.trayDelete,
      },
    ]
  }),

  // ------------------------------------------------------------ shift+arrows: move the thought itself
  ...(
    [
      ['up', -1, 0, 'Move up a quadrant'],
      ['down', 1, 0, 'Move down a quadrant'],
      ['left', 0, -1, 'Move to the left quadrant'],
      ['right', 0, 1, 'Move to the right quadrant'],
    ] as const
  ).map(
    ([key, dr, dc, title]): Command => ({
      id: `sort.shift.${key}`,
      title,
      hud: 'Move',
      group: 'Sort',
      scope: 'sort',
      keys: [`shift+${key}`],
      repeat: true,
      palette: false,
      sheet: false,
      run: () => a.sortShift(dr, dc),
    }),
  ),
  {
    id: 'plan.shift.left',
    title: 'Move a day earlier',
    hud: '← Day',
    group: 'Plan',
    scope: 'plan',
    keys: ['shift+left'],
    repeat: true,
    palette: false,
    sheet: false,
    run: () => a.planShift(-1),
  },
  {
    id: 'plan.shift.right',
    title: 'Move a day later',
    hud: 'Day →',
    group: 'Plan',
    scope: 'plan',
    keys: ['shift+right'],
    repeat: true,
    palette: false,
    sheet: false,
    run: () => a.planShift(1),
  },
  {
    id: 'plan.shift.up',
    title: 'Move up within the day',
    hud: 'Move up',
    group: 'Plan',
    scope: 'plan',
    keys: ['shift+up'],
    repeat: true,
    palette: false,
    sheet: false,
    run: () => a.planReorder(-1),
  },
  {
    id: 'plan.shift.down',
    title: 'Move down within the day',
    hud: 'Move down',
    group: 'Plan',
    scope: 'plan',
    keys: ['shift+down'],
    repeat: true,
    palette: false,
    sheet: false,
    run: () => a.planReorder(1),
  },

  // ------------------------------------------------------------ today
  {
    id: 'today.done',
    title: 'Tick off, next',
    hud: 'Done',
    group: 'Today',
    scope: 'today',
    keys: ['x', 'space'],
    run: a.todayToggle,
  },
  {
    id: 'today.defer',
    title: 'Not today: move to tomorrow',
    hud: '→ Tomorrow',
    group: 'Today',
    scope: 'today',
    keys: ['t'],
    keywords: 'defer later postpone snooze',
    run: a.todayDefer,
  },
  {
    id: 'today.focus',
    title: 'Focus 25 minutes on this',
    hud: 'Focus',
    group: 'Today',
    scope: 'today',
    keys: ['f'],
    keywords: 'pomodoro timer concentrate',
    run: a.focusToggle,
  },
  {
    id: 'today.down',
    title: 'Next',
    hud: 'Down',
    group: 'Today',
    scope: 'today',
    keys: ['down', 'j'],
    repeat: true,
    palette: false,
    run: () => a.todayMove(1),
  },
  {
    id: 'today.up',
    title: 'Previous',
    hud: 'Up',
    group: 'Today',
    scope: 'today',
    keys: ['up', 'k'],
    repeat: true,
    palette: false,
    run: () => a.todayMove(-1),
  },
  {
    id: 'today.moveDown',
    title: 'Move down',
    hud: 'Move down',
    group: 'Today',
    scope: 'today',
    keys: ['shift+down'],
    repeat: true,
    palette: false,
    run: () => a.todayReorder(1),
  },
  {
    id: 'today.moveUp',
    title: 'Move up',
    hud: 'Move up',
    group: 'Today',
    scope: 'today',
    keys: ['shift+up'],
    repeat: true,
    palette: false,
    run: () => a.todayReorder(-1),
  },
  {
    id: 'focus.stop',
    title: 'Stop focus timer',
    group: 'General',
    keywords: 'pomodoro cancel',
    run: a.focusStop,
  },

  // ------------------------------------------------------------ export
  {
    id: 'export.plan',
    title: 'Copy plan as Markdown',
    group: 'Export',
    keywords: 'clipboard todo checklist share week',
    run: () => void x.copyPlan(),
  },
  {
    id: 'export.matrix',
    title: 'Copy priorities as Markdown',
    group: 'Export',
    keywords: 'clipboard eisenhower matrix quadrants',
    run: () => void x.copyMatrix(),
  },
  {
    id: 'export.ics',
    title: 'Download calendar file (.ics)',
    group: 'Export',
    keywords: 'apple google outlook calendar events import',
    run: x.downloadCalendar,
  },
  {
    id: 'export.things',
    title: 'Send plan to Things 3',
    group: 'Export',
    keywords: 'todo tasks cultured code',
    run: x.sendToThings,
  },

  // ------------------------------------------------------------ data
  { id: 'data.backup', title: 'Download backup (.json)', group: 'Data', keywords: 'export save', run: x.downloadBackup },
  { id: 'data.restore', title: 'Restore from backup…', group: 'Data', keywords: 'import load', run: x.restoreBackup },
  { id: 'data.clearDone', title: 'Clear completed items', group: 'Data', keywords: 'remove done', run: a.clearDone },
  {
    id: 'data.clearAll',
    title: 'Start fresh (clear everything)',
    group: 'Data',
    keywords: 'reset delete all new session wipe',
    run: a.clearAll,
  },

  // ------------------------------------------------------------ settings
  { id: 'settings.theme', title: 'Switch theme', group: 'Settings', keywords: 'dark light mode appearance', run: a.cycleTheme },
  {
    id: 'settings.hud',
    title: 'Toggle keystroke overlay',
    group: 'Settings',
    keywords: 'hud keycast keys visual feedback',
    run: a.toggleHud,
  },
]

/** Extra rows for the shortcut sheet that are behaviours rather than single commands. */
export interface SheetHint {
  group: Group
  title: string
  keys: string[]
  /** Literal keycap labels instead of key specs. */
  literal?: boolean
}

export const SHEET_HINTS: SheetHint[] = [
  { group: 'General', title: 'Start typing in Sort or Plan to search', keys: ['a–z'], literal: true },
  { group: 'General', title: 'Paste a list: one thought per line', keys: ['mod+v'] },
  { group: 'Modes', title: 'Previous / next screen', keys: ['alt+left', 'alt+right'] },
  { group: 'Dump', title: 'Start typing anywhere to add', keys: ['a–z'], literal: true },
  { group: 'Dump', title: 'While typing: save and start the next', keys: ['enter'] },
  { group: 'Dump', title: 'While typing: finish (double-tap ⇧ or esc)', keys: ['escape'] },
  { group: 'Dump', title: 'While typing: line above / below', keys: ['up', 'down'] },
  { group: 'Dump', title: 'On an empty line: delete and step back', keys: ['backspace'] },
  { group: 'Sort', title: 'Move the thought between quadrants', keys: ['shift+up', 'shift+down', 'shift+left', 'shift+right'] },
  { group: 'Plan', title: 'Plan for today … +6 days', keys: ['1–7'], literal: true },
  { group: 'Plan', title: 'Move a day earlier / later', keys: ['shift+left', 'shift+right'] },
  { group: 'Plan', title: 'Reorder within the day', keys: ['shift+up', 'shift+down'] },
]

const parsed = new Map(COMMANDS.map((c) => [c.id, (c.keys ?? []).map(parseCombo)]))

/** Finds the command bound to this key press. Mode-scoped bindings win over global ones. */
export function findCommand(e: KeyboardEvent, mode: Mode, typing: boolean): Command | undefined {
  const candidates = COMMANDS.filter((c) => (!typing || c.inInput) && (!c.scope || c.scope === mode))
  const hits = candidates.filter((c) => parsed.get(c.id)!.some((combo) => matchCombo(e, combo)))
  return hits.find((c) => c.scope) ?? hits[0]
}
