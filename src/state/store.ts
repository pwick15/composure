import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
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

export interface State {
  // persisted
  items: Item[]
  mode: Mode
  theme: Theme
  hud: boolean

  // dump
  selectedId: string | null
  editing: Editing

  // sort / plan
  decks: { sort: Deck; plan: Deck }
  trayEditing: string | null
  trayExit: TrayExit
  landed: { id: string; n: number } | null

  // today
  todayCursor: string | null
  /** The "add a task" line on Today while it's open, with what the next task will be filed as. */
  todayAdd: {
    quadrant: Quadrant | null
    minutes: number | null
    /** Which option arrow keys are on, or null while the cursor is in the text. */
    cursor: { row: number; col: number } | null
  } | null
  /** The work session in progress, if any. Persisted, so it survives a reload. */
  run: Run | null

  // overlays
  palette: { open: boolean; seed: string; nonce: number }
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

        selectedId: null,
        editing: null,

        decks: { sort: freshDeck(), plan: freshDeck() },
        trayEditing: null,
        trayExit: { x: 0, y: -1 },
        landed: null,

        todayCursor: null,
        todayAdd: null,
        run: null,

        palette: { open: false, seed: '', nonce: 0 },
        helpOpen: false,
        toasts: [],

        past: [],
        future: [],
      }),
    {
      name: 'composure:v1',
      version: 4,
      // v2 added subtasks (older thoughts are all top-level), v3 time estimates (none yet), v4 work
      // sessions (everything is in the first) and replaced the single-task focus timer.
      migrate: (persisted) => {
        const old = persisted as { items?: Partial<Item>[]; focus?: unknown }
        const items = (old.items ?? []).map((i) => ({
          ...i,
          parentId: i.parentId ?? null,
          minutes: i.minutes ?? null,
          session: i.session ?? 1,
        }))
        const { focus: _focus, ...rest } = old
        return { ...rest, items } as State
      },
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ items: s.items, mode: s.mode, theme: s.theme, hud: s.hud, run: s.run }),
    },
  ),
)

export const getState = useStore.getState
export const setState = useStore.setState
