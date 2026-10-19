import { planColumns, todayKey } from '../lib/dates'
import { fmt, PRESETS } from '../lib/duration'
import { QUADRANTS } from '../lib/quadrants'
import type { Mode } from '../lib/types'
import * as a from '../state/actions'
import * as x from '../state/exporters'
import { getState } from '../state/store'
import { parseCombo, matchCombo } from './keys'

// The rule: letters always type. On every screen a letter opens search with it, so no command is
// a bare letter. Commands are digits, arrows, Space, ↵, ⌫, - and =, or ⌘ / ⌥ chords.

export type Group = 'Modes' | 'Everywhere' | 'Dump' | 'Sort' | 'Plan' | 'Today' | 'Archive' | 'Export' | 'Data' | 'Settings'

export const GROUP_ORDER: Group[] = ['Modes', 'Everywhere', 'Dump', 'Sort', 'Plan', 'Today', 'Archive', 'Export', 'Data', 'Settings']

export interface Command {
  id: string
  title: string | (() => string)
  group: Group
  /** Key specs; the first one is shown as the primary shortcut. */
  keys?: string[]
  /** Short label for the keystroke HUD. Defaults to the title. */
  hud?: string | (() => string)
  keywords?: string
  /** Only active in this mode. Global when neither this nor `scopes` is set. */
  scope?: Mode
  /** Only active on these screens: one command for a key that means the same on each of them. */
  scopes?: Mode[]
  /** Only active while this holds (for keys that mean something else in some states). */
  when?: () => boolean
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

/** Whether a command is active on a screen. */
export const inScope = (c: Command, mode: Mode) => (!c.scope && !c.scopes) || c.scope === mode || Boolean(c.scopes?.includes(mode))

const dayTitle = (n: number) => () => {
  const col = planColumns(todayKey())[n - 1]
  return col.today || col.label === 'Tomorrow' ? `Plan for ${col.label.toLowerCase()}` : `Plan for ${col.sub}`
}

/** The screens with a selected thought, where the shared editing keys act on it. */
const LISTS: Mode[] = ['dump', 'sort', 'plan', 'today']

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
    id: 'mode.archive',
    title: 'Open archive',
    hud: 'Archive',
    group: 'Modes',
    keys: ['shift+5'],
    keywords: 'archive done completed finished history past old',
    run: () => a.setMode('archive'),
  },
  {
    id: 'mode.next',
    title: 'Next screen',
    hud: 'Screen →',
    group: 'Modes',
    keys: ['alt+right'],
    palette: false,
    run: () => a.cycleMode(1),
  },
  {
    id: 'mode.prev',
    title: 'Previous screen',
    hud: '← Screen',
    group: 'Modes',
    keys: ['alt+left'],
    palette: false,
    run: () => a.cycleMode(-1),
  },

  // ------------------------------------------------------------ everywhere
  {
    id: 'palette',
    title: 'Search commands and thoughts',
    hud: 'Search',
    group: 'Everywhere',
    keys: ['mod+f'],
    inInput: true,
    palette: false,
    run: () => a.openPalette(),
  },
  {
    id: 'help',
    title: 'How it works, and every key',
    hud: 'Help',
    group: 'Everywhere',
    keys: ['?'],
    keywords: 'help guide tour features cheatsheet keys hotkeys shortcuts',
    run: a.toggleHelp,
  },
  { id: 'undo', title: 'Undo', group: 'Everywhere', keys: ['mod+z'], repeat: true, run: a.undo },
  { id: 'redo', title: 'Redo', group: 'Everywhere', keys: ['mod+shift+z', 'mod+y'], repeat: true, run: a.redo },
  {
    id: 'task.open',
    title: 'Open the thought: text, priority, day, time and session',
    hud: 'Open',
    group: 'Everywhere',
    scopes: ['sort', 'plan', 'today', 'archive'],
    keys: ['enter'],
    keywords: 'edit change details inspect move reschedule',
    run: a.editCurrent,
  },
  {
    id: 'task.edit',
    title: 'Open the thought, on any screen',
    hud: 'Open',
    group: 'Everywhere',
    keys: ['mod+e'],
    keywords: 'edit rename change text reword details priority day time session',
    run: a.editCurrent,
  },
  {
    id: 'task.when',
    title: 'Give it a day: tue, in 2 days, 24/12…',
    hud: 'When',
    group: 'Everywhere',
    keys: ['mod+s'],
    inInput: true,
    keywords: 'when schedule date day plan due reschedule move assign calendar tomorrow',
    run: a.whenOpen,
  },
  {
    id: 'task.done',
    title: 'Mark done (reopen, in the Archive)',
    hud: () => (getState().mode === 'archive' ? 'Reopen' : 'Done'),
    group: 'Everywhere',
    keys: ['mod+k'],
    keywords: 'complete tick finish check off archive reopen undone',
    run: a.completeCurrent,
  },
  {
    id: 'task.delete',
    title: 'Delete it',
    hud: 'Delete',
    group: 'Everywhere',
    keys: ['mod+backspace'],
    keywords: 'remove trash',
    run: a.deleteCurrent,
  },
  {
    id: 'pick.up',
    title: 'Pick several: extend up',
    hud: 'Pick ↑',
    group: 'Everywhere',
    scopes: LISTS,
    keys: ['shift+up'],
    repeat: true,
    keywords: 'select multiple several highlight range bulk many',
    run: () => a.pickExtend(-1),
  },
  {
    id: 'pick.down',
    title: 'Pick several: extend down',
    hud: 'Pick ↓',
    group: 'Everywhere',
    scopes: LISTS,
    keys: ['shift+down'],
    repeat: true,
    keywords: 'select multiple several highlight range bulk many',
    run: () => a.pickExtend(1),
  },
  {
    id: 'pick.clear',
    title: 'Back to one selected thought',
    hud: 'Unpick',
    group: 'Everywhere',
    keys: ['escape'],
    when: () => getState().picked !== null,
    palette: false,
    sheet: false,
    run: a.pickClear,
  },
  {
    id: 'order.up',
    title: 'Move it up the list',
    hud: 'Move up',
    group: 'Everywhere',
    scopes: LISTS,
    keys: ['alt+up'],
    repeat: true,
    keywords: 'order reorder rearrange priority position override manual up',
    run: () => a.orderMove(-1),
  },
  {
    id: 'order.down',
    title: 'Move it down the list',
    hud: 'Move down',
    group: 'Everywhere',
    scopes: LISTS,
    keys: ['alt+down'],
    repeat: true,
    keywords: 'order reorder rearrange priority position override manual down',
    run: () => a.orderMove(1),
  },
  {
    id: 'time.longer',
    title: 'Takes longer',
    hud: 'Longer',
    group: 'Everywhere',
    scopes: LISTS,
    keys: ['=', 'plus'],
    repeat: true,
    keywords: 'time estimate duration minutes how long more',
    run: () => a.estimateStep(1),
  },
  {
    id: 'time.shorter',
    title: 'Takes less time',
    hud: 'Shorter',
    group: 'Everywhere',
    scopes: LISTS,
    keys: ['-'],
    repeat: true,
    keywords: 'time estimate duration minutes how long less',
    run: () => a.estimateStep(-1),
  },
  ...PRESETS.map(
    (m, i): Command => ({
      id: `time.${i + 1}`,
      title: `Takes ${fmt(m)}`,
      hud: `~${fmt(m)}`,
      group: 'Everywhere',
      scopes: LISTS,
      keys: [`alt+${i + 1}`],
      sheet: false,
      keywords: 'time estimate duration minutes how long',
      run: () => a.estimatePreset(i + 1),
    }),
  ),

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
  { id: 'dump.edit', title: 'Edit its text, in the list', hud: 'Edit', group: 'Dump', scope: 'dump', keys: ['enter'], run: a.dumpEnter },
  {
    id: 'dump.finish',
    title: 'Fill in what is missing: priority, day, time',
    hud: 'Fill in',
    group: 'Dump',
    scope: 'dump',
    keys: ['right'],
    keywords: 'sort plan priority urgent important day when time estimate how long complete clear',
    run: a.fillOpen,
  },
  {
    id: 'dump.sub',
    title: 'Add a subtask',
    hud: 'Subtask',
    group: 'Dump',
    scope: 'dump',
    keys: ['alt+enter'],
    keywords: 'child nested break down split steps',
    run: a.dumpAddSub,
  },
  {
    id: 'dump.indent',
    title: 'Make it a subtask of the thought above',
    hud: 'Nest',
    group: 'Dump',
    scope: 'dump',
    keys: ['tab'],
    keywords: 'indent child nest',
    run: () => a.dumpIndent(1),
  },
  {
    id: 'dump.outdent',
    title: 'Make it a thought again',
    hud: 'Un-nest',
    group: 'Dump',
    scope: 'dump',
    keys: ['shift+tab'],
    keywords: 'outdent unnest promote',
    run: () => a.dumpIndent(-1),
  },
  {
    id: 'dump.up',
    title: 'Select previous',
    hud: 'Up',
    group: 'Dump',
    scope: 'dump',
    keys: ['up'],
    repeat: true,
    palette: false,
    sheet: false,
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
    sheet: false,
    run: () => a.dumpSelect(1),
  },
  {
    id: 'dump.escape',
    title: 'Clear selection',
    hud: 'Deselect',
    group: 'Dump',
    scope: 'dump',
    keys: ['escape'],
    palette: false,
    sheet: false,
    run: a.dumpEscape,
  },
  {
    id: 'dump.planned',
    title: () => (getState().showPlanned ? 'Hide sorted and planned thoughts' : 'Show sorted and planned thoughts'),
    hud: 'Planned',
    group: 'Dump',
    scope: 'dump',
    keywords: 'hide show cleared done finished tucked away',
    run: a.togglePlanned,
  },

  // ------------------------------------------------------------ sort
  ...QUADRANTS.map(
    (q): Command => ({
      id: `sort.${q.id}`,
      title: `File under ${q.title} (${q.blurb.toLowerCase()})`,
      hud: `→ ${q.title}`,
      group: 'Sort',
      scope: 'sort',
      keys: [q.num],
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
        keys: ['down'],
        repeat: true,
        palette: false,
        sheet: false,
        run: () => a.deckMove(m, 1),
      },
      {
        id: `${m}.up`,
        title: 'Previous in list',
        hud: 'Up',
        group,
        scope: m,
        keys: ['up'],
        repeat: true,
        palette: false,
        sheet: false,
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
        title: 'Skip: keep it as it is, next',
        hud: 'Skip',
        group,
        scope: m,
        keys: ['space'],
        keywords: 'skip keep next pass later',
        run: () => a.deckKeep(m),
      },
    ]
  }),

  // ------------------------------------------------------------ shift and ⌘ arrows: move the thought itself
  ...(
    [
      ['up', -1, 0, 'Move up a quadrant', 'mod'],
      ['down', 1, 0, 'Move down a quadrant', 'mod'],
      ['left', 0, -1, 'Move to the left quadrant', 'shift'],
      ['right', 0, 1, 'Move to the right quadrant', 'shift'],
    ] as const
  ).map(
    ([key, dr, dc, title, modifier]): Command => ({
      id: `sort.shift.${key}`,
      title,
      hud: 'Move',
      group: 'Sort',
      scope: 'sort',
      keys: [`${modifier}+${key}`],
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

  // ------------------------------------------------------------ today
  {
    id: 'today.add',
    title: 'Add a task to today',
    hud: 'Add',
    group: 'Today',
    scope: 'today',
    keys: ['space'],
    keywords: 'new create task quick add',
    run: a.todayAddOpen,
  },
  {
    id: 'today.defer',
    title: 'Not today: move to tomorrow',
    hud: '→ Tomorrow',
    group: 'Today',
    scope: 'today',
    keys: ['alt+t'],
    keywords: 'defer later postpone snooze tomorrow',
    run: a.todayDefer,
  },
  {
    id: 'today.session',
    title: () => (getState().run?.phase === 'over' ? 'Carry on with what is left' : 'Start or stop a work session'),
    hud: () => (getState().run?.phase === 'over' ? 'Carry on' : 'Session'),
    group: 'Today',
    scope: 'today',
    keys: ['alt+f'],
    keywords: 'focus pomodoro timer concentrate block start stop carry on continue',
    run: a.sessionToggle,
  },
  {
    id: 'today.stop',
    title: "Stop: time's up and that's enough",
    hud: 'Stop',
    group: 'Today',
    scope: 'today',
    keys: ['escape'],
    when: () => getState().run?.phase === 'over' && getState().picked === null,
    palette: false,
    sheet: false,
    run: a.sessionStop,
  },
  {
    id: 'today.back',
    title: "I'm back",
    hud: 'Back',
    group: 'Today',
    scope: 'today',
    keys: ['enter'],
    // While you're away the screen shows nothing but the way back, so ↵ is it.
    when: () => Boolean(getState().run?.pause),
    palette: false,
    sheet: false,
    run: a.pauseEnd,
  },
  {
    id: 'today.pause',
    title: 'Something came up: interruption, side task or break (or say you are back)',
    hud: 'Interruption',
    group: 'Today',
    scope: 'today',
    keys: ['alt+p'],
    keywords: 'pause break bathroom toilet call phone laundry chore interrupt away distraction coffee back',
    run: a.pauseOpen,
  },
  {
    id: 'today.rename',
    title: 'Name this session: morning, deep work, admin…',
    hud: 'Name',
    group: 'Today',
    scope: 'today',
    keys: ['alt+r'],
    keywords: 'rename session name label call block title',
    run: a.sessionRenameOpen,
  },
  {
    id: 'today.sessionPrev',
    title: 'Move to the previous session',
    hud: '← Session',
    group: 'Today',
    scope: 'today',
    keys: ['shift+left'],
    repeat: true,
    keywords: 'split morning afternoon block',
    run: () => a.todayMoveSession(-1),
  },
  {
    id: 'today.sessionNext',
    title: 'Move to the next session (past the last starts a new one)',
    hud: 'Session →',
    group: 'Today',
    scope: 'today',
    keys: ['shift+right'],
    repeat: true,
    keywords: 'split morning afternoon block',
    run: () => a.todayMoveSession(1),
  },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(
    (n): Command => ({
      id: `today.session${n}`,
      title: `Move to session ${n}`,
      hud: () => `→ ${a.sessionName(n)}`,
      group: 'Today',
      scope: 'today',
      keys: [String(n)],
      palette: false,
      sheet: false,
      run: () => a.todayToSession(n),
    }),
  ),
  {
    id: 'today.down',
    title: 'Next',
    hud: 'Down',
    group: 'Today',
    scope: 'today',
    keys: ['down'],
    repeat: true,
    palette: false,
    sheet: false,
    run: () => a.todayMove(1),
  },
  {
    id: 'today.up',
    title: 'Previous',
    hud: 'Up',
    group: 'Today',
    scope: 'today',
    keys: ['up'],
    repeat: true,
    palette: false,
    sheet: false,
    run: () => a.todayMove(-1),
  },
  {
    id: 'session.stop',
    title: 'Stop the work session',
    group: 'Today',
    keywords: 'pomodoro timer focus cancel end',
    run: a.sessionStop,
  },

  // ------------------------------------------------------------ archive
  {
    id: 'archive.back',
    title: 'Back',
    hud: 'Back',
    group: 'Archive',
    scope: 'archive',
    keys: ['backspace', 'escape'],
    keywords: 'close leave exit return',
    run: a.archiveBack,
  },
  {
    id: 'archive.down',
    title: 'Next',
    hud: 'Down',
    group: 'Archive',
    scope: 'archive',
    keys: ['down'],
    repeat: true,
    palette: false,
    sheet: false,
    run: () => a.archiveMove(1),
  },
  {
    id: 'archive.up',
    title: 'Previous',
    hud: 'Up',
    group: 'Archive',
    scope: 'archive',
    keys: ['up'],
    repeat: true,
    palette: false,
    sheet: false,
    run: () => a.archiveMove(-1),
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
  {
    id: 'data.export',
    title: 'Export everything to a file',
    hud: 'Export',
    group: 'Data',
    keys: ['mod+shift+s'],
    inInput: true,
    keywords: 'backup save download json share move transfer',
    run: x.downloadBackup,
  },
  {
    id: 'data.import',
    title: 'Import from a file…',
    hud: 'Import',
    group: 'Data',
    keys: ['mod+o'],
    inInput: true,
    keywords: 'restore load open merge markdown md txt json backup',
    run: x.pickImport,
  },
  {
    id: 'data.unorganise',
    title: 'Start the sorting over: clear every priority, day and time',
    group: 'Data',
    keywords: 'undo reset redo sort plan organise organize unsort unplan forgot again clear priorities days times',
    run: a.unorganise,
  },
  {
    id: 'data.autoOrder',
    title: 'Back to the automatic order (quickest first) everywhere',
    group: 'Data',
    keywords: 'reset order manual rearranged undo sort by time shortest first',
    run: a.orderAuto,
  },
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
  { group: 'Everywhere', title: 'Type anything to search', keys: ['a–z'], literal: true },
  { group: 'Everywhere', title: 'Move the selection', keys: ['up', 'down'] },
  { group: 'Everywhere', title: 'How long it takes: 5m 15m 30m 1h 2h 4h', keys: ['⌥1–6'], literal: true },
  { group: 'Everywhere', title: 'Paste a list: one thought per line', keys: ['mod+v'] },
  { group: 'Dump', title: 'While typing: save and start the next', keys: ['enter'] },
  { group: 'Dump', title: 'While typing: nest / un-nest this line', keys: ['tab', 'shift+tab'] },
  { group: 'Dump', title: 'While typing: finish (double-tap ⇧ or esc)', keys: ['escape'] },
  { group: 'Dump', title: 'On an empty line: delete it and step back', keys: ['backspace'] },
  { group: 'Sort', title: 'Move the thought between quadrants', keys: ['mod+up', 'mod+down', 'shift+left', 'shift+right'] },
  { group: 'Plan', title: 'Plan for today … +6 days', keys: ['1–7'], literal: true },
  { group: 'Plan', title: 'Move a day earlier / later', keys: ['shift+left', 'shift+right'] },
  { group: 'Today', title: 'Move it to that session', keys: ['1–9'], literal: true },
]

const parsed = new Map(COMMANDS.map((c) => [c.id, (c.keys ?? []).map(parseCombo)]))

/** Finds the command bound to this key press. A screen's own binding wins over a shared or global one. */
export function findCommand(e: KeyboardEvent, mode: Mode, typing: boolean): Command | undefined {
  const candidates = COMMANDS.filter((c) => (!typing || c.inInput) && inScope(c, mode) && (!c.when || c.when()))
  const hits = candidates.filter((c) => parsed.get(c.id)!.some((combo) => matchCombo(e, combo)))
  return hits.find((c) => c.scope) ?? hits.find((c) => c.scopes) ?? hits[0]
}
