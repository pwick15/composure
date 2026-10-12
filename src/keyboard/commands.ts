import { planColumns, todayKey } from '../lib/dates'
import { QUADRANTS } from '../lib/quadrants'
import type { Mode } from '../lib/types'
import * as a from '../state/actions'
import * as x from '../state/exporters'
import { parseCombo, matchCombo } from './keys'

export type Group = 'Modes' | 'General' | 'Dump' | 'Sort' | 'Plan' | 'Export' | 'Data' | 'Settings'

export const GROUP_ORDER: Group[] = ['Modes', 'Dump', 'Sort', 'Plan', 'General', 'Export', 'Data', 'Settings']

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
    keys: ['alt+up'],
    repeat: true,
    run: () => a.dumpMove(-1),
  },
  {
    id: 'dump.moveDown',
    title: 'Move selected down',
    hud: 'Move down',
    group: 'Dump',
    scope: 'dump',
    keys: ['alt+down'],
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
      title: `Move to ${q.title} (${q.blurb.toLowerCase()})`,
      hud: `→ ${q.title}`,
      group: 'Sort',
      scope: 'sort',
      keys: [q.key, q.num],
      run: () => a.sortPick(q.id),
    }),
  ),
  ...QUADRANTS.map(
    (q): Command => ({
      id: `sort.${q.id}.fast`,
      title: `${q.title} and next`,
      hud: `${q.title} ✓`,
      group: 'Sort',
      scope: 'sort',
      keys: [`shift+${q.key}`],
      palette: false,
      sheet: false,
      run: () => {
        a.sortPick(q.id)
        a.sortConfirm()
      },
    }),
  ),
  {
    id: 'sort.confirm',
    title: 'Confirm and next',
    hud: 'Confirm',
    group: 'Sort',
    scope: 'sort',
    keys: ['enter'],
    run: a.sortConfirm,
  },
  {
    id: 'sort.clear',
    title: 'Back to unsorted',
    hud: 'Unsort',
    group: 'Sort',
    scope: 'sort',
    keys: ['0', 'backspace'],
    run: () => a.sortPick(null),
  },
  ...(
    [
      ['up', -1, 0],
      ['down', 1, 0],
      ['left', 0, -1],
      ['right', 0, 1],
    ] as const
  ).map(
    ([key, dr, dc]): Command => ({
      id: `sort.nudge.${key}`,
      title: 'Move target',
      hud: 'Target',
      group: 'Sort',
      scope: 'sort',
      keys: [key],
      palette: false,
      sheet: false,
      run: () => a.sortNudge(dr, dc),
    }),
  ),
  {
    id: 'sort.next',
    title: 'Next item',
    hud: 'Next',
    group: 'Sort',
    scope: 'sort',
    keys: ['j', 'tab'],
    repeat: true,
    run: () => a.sortStep(1),
  },
  {
    id: 'sort.prev',
    title: 'Previous item',
    hud: 'Prev',
    group: 'Sort',
    scope: 'sort',
    keys: ['k', 'shift+tab'],
    repeat: true,
    run: () => a.sortStep(-1),
  },
  { id: 'sort.edit', title: 'Edit text', hud: 'Edit', group: 'Sort', scope: 'sort', keys: ['e'], run: a.trayEdit },
  { id: 'sort.done', title: 'Toggle done', hud: 'Done', group: 'Sort', scope: 'sort', keys: ['x'], run: a.trayToggleDone },
  {
    id: 'sort.delete',
    title: 'Delete item',
    hud: 'Delete',
    group: 'Sort',
    scope: 'sort',
    keys: ['mod+backspace'],
    run: a.trayDelete,
  },
  {
    id: 'sort.cancel',
    title: 'Cancel choice',
    hud: 'Cancel',
    group: 'Sort',
    scope: 'sort',
    keys: ['escape'],
    palette: false,
    run: a.sortCancel,
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
      run: () => a.planPickIndex(n),
    }),
  ),
  {
    id: 'plan.later',
    title: 'Plan for later (beyond this week)',
    hud: '→ Later',
    group: 'Plan',
    scope: 'plan',
    keys: ['8'],
    run: () => a.planPickIndex(8),
  },
  {
    id: 'plan.clear',
    title: 'Unplan',
    hud: 'Unplan',
    group: 'Plan',
    scope: 'plan',
    keys: ['0', 'backspace'],
    run: () => a.planPick(null),
  },
  {
    id: 'plan.left',
    title: 'Day earlier',
    hud: '← Day',
    group: 'Plan',
    scope: 'plan',
    keys: ['left'],
    repeat: true,
    palette: false,
    run: () => a.planNudge(-1),
  },
  {
    id: 'plan.right',
    title: 'Day later',
    hud: 'Day →',
    group: 'Plan',
    scope: 'plan',
    keys: ['right'],
    repeat: true,
    palette: false,
    run: () => a.planNudge(1),
  },
  {
    id: 'plan.confirm',
    title: 'Confirm and next',
    hud: 'Confirm',
    group: 'Plan',
    scope: 'plan',
    keys: ['enter'],
    run: a.planConfirm,
  },
  {
    id: 'plan.next',
    title: 'Next item',
    hud: 'Next',
    group: 'Plan',
    scope: 'plan',
    keys: ['j', 'tab', 'down'],
    repeat: true,
    run: () => a.planStep(1),
  },
  {
    id: 'plan.prev',
    title: 'Previous item',
    hud: 'Prev',
    group: 'Plan',
    scope: 'plan',
    keys: ['k', 'shift+tab', 'up'],
    repeat: true,
    run: () => a.planStep(-1),
  },
  { id: 'plan.edit', title: 'Edit text', hud: 'Edit', group: 'Plan', scope: 'plan', keys: ['e'], run: a.trayEdit },
  { id: 'plan.done', title: 'Toggle done', hud: 'Done', group: 'Plan', scope: 'plan', keys: ['x'], run: a.trayToggleDone },
  {
    id: 'plan.delete',
    title: 'Delete item',
    hud: 'Delete',
    group: 'Plan',
    scope: 'plan',
    keys: ['mod+backspace'],
    run: a.trayDelete,
  },
  {
    id: 'plan.cancel',
    title: 'Cancel choice',
    hud: 'Cancel',
    group: 'Plan',
    scope: 'plan',
    keys: ['escape'],
    palette: false,
    run: a.planCancel,
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
  { group: 'Dump', title: 'Start typing anywhere to add', keys: ['a–z'], literal: true },
  { group: 'Dump', title: 'While typing: save and start the next', keys: ['enter'] },
  { group: 'Dump', title: 'While typing: finish', keys: ['escape'] },
  { group: 'Dump', title: 'While typing: line above / below', keys: ['up', 'down'] },
  { group: 'Dump', title: 'On an empty line: delete and step back', keys: ['backspace'] },
  { group: 'Sort', title: 'Move target around the grid', keys: ['up', 'down', 'left', 'right'] },
  { group: 'Sort', title: 'Assign and jump to next', keys: ['shift+q', 'shift+w', 'shift+a', 'shift+s'] },
  { group: 'Plan', title: 'Slot into today … +6 days', keys: ['1–7'], literal: true },
]

const parsed = new Map(COMMANDS.map((c) => [c.id, (c.keys ?? []).map(parseCombo)]))

/** Finds the command bound to this key press. Mode-scoped bindings win over global ones. */
export function findCommand(e: KeyboardEvent, mode: Mode, typing: boolean): Command | undefined {
  const candidates = COMMANDS.filter((c) => (!typing || c.inInput) && (!c.scope || c.scope === mode))
  const hits = candidates.filter((c) => parsed.get(c.id)!.some((combo) => matchCombo(e, combo)))
  return hits.find((c) => c.scope) ?? hits[0]
}
