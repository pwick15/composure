import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { todayKey } from '../lib/dates'
import type { Run } from '../lib/session'
import type { Gap } from '../lib/selectors'
import type { Item, Mode, Quadrant, Slot, Theme } from '../lib/types'

export type Editing =
  | { kind: 'item'; id: string; caret: 'start' | 'end' }
  | { kind: 'draft'; afterId: string | null; parentId: string | null; seed: string; nonce: number }
  | null

export interface Toast {
  id: number
  text: string
  keys?: string
}

/**
 * A Sort or Plan session: which thought is selected, what was filed (for ⌫ back),
 * and which queued thought to return to after wandering off into filed ones.
 */
export interface Deck {
  cursor: string | null
  trail: string[]
  resume: string | null
}

export const freshDeck = (): Deck => ({ cursor: null, trail: [], resume: null })

/** Where the tray card flew off to, so its exit animation points at its destination. */
export interface TrayExit {
  x: number
  y: number
}

export interface State {
  // persisted
  items: Item[]
  mode: Mode
  theme: Theme
  hud: boolean
  /** Dump lists thoughts that are sorted and planned too, instead of tucking them away. */
  showPlanned: boolean

  // dump
  selectedId: string | null
  editing: Editing
  /** → on a thought in Dump: filling in what it lacks. `step` is what's being asked, `col` the highlighted option. */
  dumpFinish: { id: string; step: Gap; col: number } | null

  // sort / plan
  decks: { sort: Deck; plan: Deck }
  /** The thought whose text is being edited in place on Sort, Plan, Today or the Archive. */
  trayEditing: string | null
  trayExit: TrayExit
  landed: { id: string; n: number } | null

  /**
   * Thoughts highlighted together with ⇧↑/⇧↓ (in reading order, the selected one at one end).
   * Keys act on all of them. Null when just the one is selected. Not persisted.
   */
  picked: { anchor: string; ids: string[] } | null

  // today
  todayCursor: string | null

  // archive
  archiveCursor: string | null
  /** The screen the Archive was opened from, so Back returns to it. Not persisted. */
  archiveFrom: Mode
  /** The "add a task" line on Today while it's open, with what the next task will be filed as. */
  todayAdd: {
    quadrant: Quadrant | null
    minutes: number | null
    /** Which option arrow keys are on, or null while the cursor is in the text. */
    cursor: { row: number; col: number } | null
  } | null
  /** The "what came up?" line on the focus view while it's open. */
  pausing: boolean
  /** The work session in progress, if any. Persisted, so it survives a reload. */
  run: Run | null

  // overlays
  palette: { open: boolean; seed: string; nonce: number }
  /** The "when" picker, while it's open: the thought (and its open subtasks) it will give a day to. */
  when: { ids: string[]; text: string; current: Slot | null; many?: boolean } | null
  helpOpen: boolean
  toasts: Toast[]

  // history (not persisted)
  past: Item[][]
  future: Item[][]
}

export const useStore = create<State>()(
  persist(
    (): State => ({
        items: [],
        mode: 'dump',
        theme: 'system',
        hud: true,
        showPlanned: false,

        selectedId: null,
        editing: null,
        dumpFinish: null,

        decks: { sort: freshDeck(), plan: freshDeck() },
        trayEditing: null,
        trayExit: { x: 0, y: -1 },
        landed: null,

        picked: null,

        todayCursor: null,
        archiveCursor: null,
        archiveFrom: 'dump',
        todayAdd: null,
        pausing: false,
        run: null,

        palette: { open: false, seed: '', nonce: 0 },
        when: null,
        helpOpen: false,
        toasts: [],

        past: [],
        future: [],
      }),
    {
      name: 'composure:v1',
      version: 5,
      // v2 added subtasks (older thoughts are all top-level), v3 time estimates (none yet), v4 work
      // sessions (everything is in the first) and replaced the single-task focus timer, v5 the day a
      // thought was done (the Archive groups by it).
      migrate: (persisted) => {
        const old = persisted as { items?: Partial<Item>[]; focus?: unknown }
        const today = todayKey()
        const items = (old.items ?? []).map((i) => ({
          ...i,
          parentId: i.parentId ?? null,
          minutes: i.minutes ?? null,
          session: i.session ?? 1,
          doneAt: i.doneAt ?? (i.done && i.slot === today ? Date.now() : null),
        }))
        const { focus: _focus, ...rest } = old
        return { ...rest, items } as State
      },
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ items: s.items, mode: s.mode, theme: s.theme, hud: s.hud, showPlanned: s.showPlanned, run: s.run }),
    },
  ),
)

export const getState = useStore.getState
export const setState = useStore.setState
