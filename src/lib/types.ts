export type Mode = 'dump' | 'sort' | 'plan' | 'today' | 'archive'

export type Quadrant = 'do' | 'schedule' | 'delegate' | 'drop'

/** A planned slot: an ISO day key (YYYY-MM-DD) or the open-ended "later" bucket. */
export type Slot = string

export interface Item {
  id: string
  text: string
  createdAt: number
  quadrant: Quadrant | null
  slot: Slot | null
  done: boolean
  /** When it was ticked off (ms). Null while open, and for done thoughts nobody dated, which count as long ago. */
  doneAt: number | null
  /** The thought this is a subtask of. One level deep: a subtask never has subtasks of its own. */
  parentId: string | null
  /** How long it should take, in minutes. Null until you say. */
  minutes: number | null
  /** Which work session of the day it belongs to (1 = the first). Only matters while it's in Today. */
  session: number
  /**
   * Where you put it by hand in a list, 1 being the top. Overrides the automatic quickest-first
   * order on that screen: ranked thoughts come first in the order you set, the rest follow.
   */
  manual?: Partial<Record<View, number>>
}

/** The screens that list thoughts in an automatic order (quadrant and quickest first). */
export type View = 'sort' | 'plan' | 'today'

export type Theme = 'system' | 'dark' | 'light'
