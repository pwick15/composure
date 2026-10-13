import type { Item } from './types'

// Subtasks are ordinary items that point at a parent. `items` stays one flat list, so Sort,
// Plan and Today treat every subtask on its own; only Dump and the exports read the tree.

const hasParent = (i: Item, byId: Map<string, Item>) => i.parentId !== null && byId.has(i.parentId)

/** Ids of thoughts that have at least one subtask. */
export function parentIds(items: Item[]): Set<string> {
  const ids = new Set(items.map((i) => i.id))
  return new Set(items.flatMap((i) => (i.parentId && ids.has(i.parentId) ? [i.parentId] : [])))
}

/**
 * Thoughts you can act on: everything except parents. A parent is a label for its subtasks,
 * which are sorted, planned and ticked off one by one.
 */
export function leaves(items: Item[]): Item[] {
  const parents = parentIds(items)
  return parents.size ? items.filter((i) => !parents.has(i.id)) : items
}

export function childrenOf(items: Item[], id: string): Item[] {
  return items.filter((i) => i.parentId === id)
}

export const parentOf = (items: Item[], item: Item): Item | undefined =>
  item.parentId ? items.find((i) => i.id === item.parentId) : undefined

/** The list as Dump shows it: each thought followed by its subtasks. Orphans count as top-level. */
export function treeOrder(items: Item[]): Item[] {
  const byId = new Map(items.map((i) => [i.id, i]))
  const kids = new Map<string, Item[]>()
  for (const i of items) {
    if (!hasParent(i, byId)) continue
    kids.set(i.parentId!, [...(kids.get(i.parentId!) ?? []), i])
  }
  return items.flatMap((i) => (hasParent(i, byId) ? [] : [i, ...(kids.get(i.id) ?? [])]))
}

/** A subtask's real parent id, or null for top-level thoughts (and orphans). */
export function parentKey(items: Item[], item: Item): string | null {
  return item.parentId && items.some((i) => i.id === item.parentId) ? item.parentId : null
}

/** The last thought in a block: the final subtask of a parent, else the thought itself. */
export function lastInBlock(items: Item[], id: string): string {
  return childrenOf(items, id).at(-1)?.id ?? id
}

/** Subtasks done out of subtasks, for a parent. Null for a plain thought. */
export function progress(items: Item[], id: string): { done: number; total: number } | null {
  const kids = childrenOf(items, id)
  return kids.length ? { done: kids.filter((k) => k.done).length, total: kids.length } : null
}

/** A parent counts as done when all its subtasks are; anything else uses its own flag. */
export function isDone(items: Item[], item: Item): boolean {
  const p = progress(items, item.id)
  return p ? p.done === p.total : item.done
}

/**
 * Where a draft line sits in Dump's tree order. A top-level draft after a parent goes below
 * the parent's whole group; a subtask draft goes straight after the thought it follows.
 */
export function draftIndex(items: Item[], afterId: string | null, parentId: string | null): number {
  if (afterId === null) return 0
  const order = treeOrder(items)
  const anchor = parentId === null ? lastInBlock(items, afterId) : afterId
  const i = order.findIndex((it) => it.id === anchor)
  return i === -1 ? order.length : i + 1
}
