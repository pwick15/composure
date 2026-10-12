import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Item, Mode, Pending, Quadrant, Slot, Theme } from '../lib/types'

export type Editing =
  | { kind: 'item'; id: string; caret: 'start' | 'end' }
  | { kind: 'draft'; afterId: string | null; seed: string; nonce: number }
  | null

export interface Toast {
  id: number
  text: string
  keys?: string
}

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
  sortCursor: string | null
  sortPending: Pending<Quadrant | null> | null
  planCursor: string | null
  planPending: Pending<Slot | null> | null
  trayEditing: string | null
  trayExit: TrayExit
  landed: { id: string; n: number } | null
  shake: number

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

        sortCursor: null,
        sortPending: null,
        planCursor: null,
        planPending: null,
        trayEditing: null,
        trayExit: { x: 0, y: -1 },
        landed: null,
        shake: 0,

        palette: { open: false, seed: '', nonce: 0 },
        helpOpen: false,
        toasts: [],

        past: [],
        future: [],
      }),
    {
      name: 'composure:v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ items: s.items, mode: s.mode, theme: s.theme, hud: s.hud }),
    },
  ),
)

export const getState = useStore.getState
export const setState = useStore.setState
