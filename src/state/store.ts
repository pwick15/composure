import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { todayKey } from '../lib/dates'
import type { Field } from '../lib/fields'
import { upgradeQuadrant } from '../lib/quadrants'
import type { Run } from '../lib/session'
import type { Item, Mode, Quadrant, Theme } from '../lib/types'

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

/**
 * The thought sheet while it's open: everything about the selected thought (or the picked ones) in
 * one place, the same on every screen.
 */
export interface Sheet {
  /** The thoughts it edits, as selected: one, the picked ones, or a parent standing for its open subtasks. */
  ids: string[]
  /**
   * What it was opened for. `edit` (↵, ⌘E) stays open while you change things; `field` (⌘S, a click
   * on a tag) closes after one pick; `fill` (→ in Dump) asks for what's missing in turn and closes
   * once nothing is.
   */
  purpose: 'edit' | 'field' | 'fill'
  /** The row the keys act on. */
  row: Field
  /** The highlighted option on that row. */
  col: number
  /** What's typed on the day row ("next fri"), or null while picking by number. */
  query: string | null
  /** The last change, shown at the foot with the way back. */
  receipt: string | null
  nonce: number
}

export interface State {
  // persisted
  items: Item[]
  mode: Mode
  theme: Theme
  hud: boolean
  /** Dump lists thoughts that are sorted and planned too, instead of tucking them away. */
  showPlanned: boolean
  /** What you've called a day's work sessions: day → session number → name. Unnamed ones are "Session 2". */
  sessionNames: Record<string, Record<number, string>>

  /** The day it is. Screens read this rather than the clock, so they move on at midnight (state/day.ts). */
  today: string

  // dump
  selectedId: string | null
  editing: Editing

  // sort / plan
  decks: { sort: Deck; plan: Deck }
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
  /** The session whose name is being typed on Today. */
  sessionRename: { day: string; session: number } | null
  /** The work session in progress, if any. Persisted, so it survives a reload. */
  run: Run | null

  // overlays
  palette: { open: boolean; seed: string; nonce: number }
  sheet: Sheet | null
  helpOpen: boolean
  /** Which page of help ? opens on: how the app works, or every key. Remembered. */
  helpTab: 'guide' | 'keys'
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
        hud: false,
        showPlanned: false,
        sessionNames: {},

        today: todayKey(),

        selectedId: null,
        editing: null,

        decks: { sort: freshDeck(), plan: freshDeck() },
        trayExit: { x: 0, y: -1 },
        landed: null,

        picked: null,

        todayCursor: null,
        archiveCursor: null,
        archiveFrom: 'dump',
        todayAdd: null,
        pausing: false,
        sessionRename: null,
        run: null,

        palette: { open: false, seed: '', nonce: 0 },
        sheet: null,
        helpOpen: false,
        helpTab: 'guide',
        toasts: [],

        past: [],
        future: [],
      }),
    {
      name: 'composure:v1',
      version: 6,
      // v2 added subtasks (older thoughts are all top-level), v3 time estimates (none yet), v4 work
      // sessions (everything is in the first) and replaced the single-task focus timer, v5 the day a
      // thought was done (the Archive groups by it), v6 swapped the Eisenhower quadrants for lanes.
      migrate: (persisted) => {
        const old = persisted as { items?: Partial<Item>[]; focus?: unknown }
        const today = todayKey()
        const items = (old.items ?? []).map((i) => ({
          ...i,
          quadrant: upgradeQuadrant(i.quadrant),
          parentId: i.parentId ?? null,
          minutes: i.minutes ?? null,
          session: i.session ?? 1,
          doneAt: i.doneAt ?? (i.done && i.slot === today ? Date.now() : null),
        }))
        const { focus: _focus, ...rest } = old
        return { ...rest, items } as State
      },
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        items: s.items,
        mode: s.mode,
        theme: s.theme,
        hud: s.hud,
        showPlanned: s.showPlanned,
        sessionNames: s.sessionNames,
        helpTab: s.helpTab,
        run: s.run,
      }),
    },
  ),
)

export const getState = useStore.getState
export const setState = useStore.setState
