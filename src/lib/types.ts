export type Mode = 'dump' | 'sort' | 'plan' | 'today'

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
  /** The thought this is a subtask of. One level deep: a subtask never has subtasks of its own. */
  parentId: string | null
  /** How long it should take, in minutes. Null until you say. */
  minutes: number | null
}

export type Theme = 'system' | 'dark' | 'light'
