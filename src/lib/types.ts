export type Mode = 'dump' | 'sort' | 'plan'

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
}

export type Theme = 'system' | 'dark' | 'light'

/** Wraps a pending choice so that "pending: clear it" (value null) differs from "nothing pending". */
export interface Pending<T> {
  value: T
}
