import { addDays, columnFor, planColumns, todayKey } from '../lib/dates'
import { uid } from '../lib/id'
import { QUADRANTS, QUADRANT_BY_ID } from '../lib/quadrants'
import {
  itemsInColumn,
  nextInQueue,
  planGroups,
  resolvePlanCursor,
  resolveSortCursor,
  resolveTodayCursor,
  sortGroups,
  todayList,
} from '../lib/selectors'
import { childrenOf, draftIndex, isDone, lastInBlock, parentKey, treeOrder } from '../lib/tree'
import type { Item, Mode, Quadrant } from '../lib/types'
import { type Deck, type Editing, freshDeck, getState as get, setState as set, type TrayExit } from './store'

export type EditTarget = Exclude<Editing, null>

const HISTORY_LIMIT = 100
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
export const truncate = (s: string, n = 32) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

// ---------------------------------------------------------------- history

let txDepth = 0
let txBase: Item[] | null = null

function pushHistory(base: Item[]) {
  const { past } = get()
  set({ past: [...past.slice(-(HISTORY_LIMIT - 1)), base], future: [] })
}

function commit(next: Item[]) {
  if (txDepth > 0) {
    set({ items: next })
    return
  }
  const base = get().items
  set({ items: next })
  pushHistory(base)
}

/** Groups several item mutations into one undo step. */
export function transact<T>(fn: () => T): T {
  if (txDepth++ === 0) txBase = get().items
  try {
    return fn()
  } finally {
    if (--txDepth === 0) {
      if (txBase && get().items !== txBase) pushHistory(txBase)
      txBase = null
    }
  }
}

/** The first thought that differs between two snapshots. */
function changedId(a: Item[], b: Item[]): string | null {
  const byId = new Map(b.map((i) => [i.id, i]))
  for (const i of a) {
    const j = byId.get(i.id)
    if (!j || j.quadrant !== i.quadrant || j.slot !== i.slot || j.text !== i.text || j.done !== i.done || j.parentId !== i.parentId) return i.id
  }
  return b.find((j) => !a.some((i) => i.id === j.id))?.id ?? null
}

export function undo() {
  const s = get()
  const prev = s.past.at(-1)
  if (!prev) return toast('Nothing to undo')
  const changed = changedId(prev, s.items)
  set({ items: prev, past: s.past.slice(0, -1), future: [s.items, ...s.future], editing: null })
  // In Sort and Plan, the thought that changed comes back to the tray, ready to re-file.
  if (isDeck(s.mode) && changed && inDeck(s.mode, changed)) {
    setDeck(s.mode, { trail: get().decks[s.mode].trail.filter((id) => id !== changed) })
    wander(s.mode, changed, { x: 0, y: -1 })
  }
}

export function redo() {
  const s = get()
  const next = s.future[0]
  if (!next) return toast('Nothing to redo')
  set({ items: next, past: [...s.past, s.items], future: s.future.slice(1) })
}

// ---------------------------------------------------------------- toasts

let toastSeq = 0

export function toast(text: string, keys?: string) {
  const id = ++toastSeq
  set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, keys }] }))
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3200)
}

// ---------------------------------------------------------------- items

/** A subtask starts where its parent already is, so filing a split-up task doesn't undo itself. */
export function makeItem(text: string, parent?: Item): Item {
  return {
    id: uid(),
    text,
    createdAt: Date.now(),
    quadrant: parent?.quadrant ?? null,
    slot: parent?.slot ?? null,
    done: false,
    parentId: parent?.id ?? null,
  }
}

const findItem = (id: string | null) => (id ? get().items.find((i) => i.id === id) : undefined)

/** Previous and next thought as Dump shows them, subtasks included. */
function neighbours(id: string) {
  const order = treeOrder(get().items)
  const i = order.findIndex((it) => it.id === id)
  return { prev: order[i - 1]?.id ?? null, next: order[i + 1]?.id ?? null }
}

/** Moves `ids` (in that order) to sit right after `after`, leaving every other thought where it is. */
function relocate(items: Item[], ids: string[], after: string): Item[] {
  const moving = new Set(ids)
  const rest = items.filter((i) => !moving.has(i.id))
  const at = rest.findIndex((i) => i.id === after)
  const block = ids.map((id) => items.find((i) => i.id === id)!)
  return [...rest.slice(0, at + 1), ...block, ...rest.slice(at + 1)]
}

function patch(id: string, change: Partial<Item>) {
  const item = findItem(id)
  if (!item) return
  const same = (Object.keys(change) as (keyof Item)[]).every((k) => item[k] === change[k])
  if (same) return
  commit(get().items.map((i) => (i.id === id ? { ...i, ...change } : i)))
}

/**
 * Inserts after `afterId`; null inserts at the top. Returns the new ids. With a `parentId`
 * the new thoughts become its subtasks, after `afterId` if that is one of them, else last.
 */
export function addItems(afterId: string | null, texts: string[], parentId: string | null = null): string[] {
  if (!texts.length) return []
  const { items } = get()
  const parent = parentId ? items.find((i) => i.id === parentId) : undefined
  const created = texts.map((t) => makeItem(t, parent))
  if (parent && !(afterId && items.some((i) => i.id === afterId && i.parentId === parent.id))) {
    afterId = lastInBlock(items, parent.id)
  } else if (!parent && afterId) {
    // Below a parent means below its subtasks too, so the stored order matches what Dump shows.
    afterId = lastInBlock(items, afterId)
  }
  const found = afterId === null ? -1 : items.findIndex((i) => i.id === afterId)
  const at = afterId === null ? 0 : found === -1 ? items.length : found + 1
  commit([...items.slice(0, at), ...created, ...items.slice(at)])
  return created.map((i) => i.id)
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export const updateText = (id: string, text: string) => patch(id, { text })

/** Deletes a thought and its subtasks. Returns how many subtasks went with it (and says so). */
export function removeItem(id: string): number {
  const item = findItem(id)
  const kids = childrenOf(get().items, id).length
  commit(get().items.filter((i) => i.id !== id && i.parentId !== id))
  if (item && kids) toast(`Deleted "${truncate(item.text)}" and ${plural(kids, 'subtask')}`, 'mod+z')
  return kids
}

/** A parent has no done flag of its own: ticking it ticks every subtask, or clears them if all were done. */
export function toggleDone(id: string) {
  const item = findItem(id)
  if (!item) return
  const kids = childrenOf(get().items, id)
  if (kids.length) {
    const allDone = kids.every((k) => k.done)
    commit(get().items.map((i) => (i.parentId === id ? { ...i, done: !allDone } : i)))
    return toast(allDone ? 'Marked not done' : `Done, with ${plural(kids.length, 'subtask')}`, 'x')
  }
  patch(id, { done: !item.done })
  toast(item.done ? 'Marked not done' : 'Done', 'x')
}

/** Moves a thought up or down among its siblings; a parent takes its subtasks with it. */
export function moveItem(id: string, dir: -1 | 1) {
  const items = [...get().items]
  const item = items.find((it) => it.id === id)
  if (!item) return
  const key = parentKey(items, item)
  const siblings = items.filter((it) => parentKey(items, it) === key)
  const other = siblings[siblings.findIndex((it) => it.id === id) + dir]
  if (!other) return
  const a = items.indexOf(item)
  const b = items.indexOf(other)
  ;[items[a], items[b]] = [items[b], items[a]]
  commit(items)
}

// ---------------------------------------------------------------- subtasks

/** Tab: nest a thought under the one above it. Its own subtasks come along as siblings (one level only). */
export function indentItem(id: string): boolean {
  const { items } = get()
  const item = items.find((i) => i.id === id)
  if (!item) return false
  if (parentKey(items, item)) {
    toast('Already a subtask. One level deep keeps it simple')
    return false
  }
  const order = treeOrder(items)
  const above = order[order.findIndex((i) => i.id === id) - 1]
  if (!above) {
    toast('Nothing above to nest under')
    return false
  }
  const parent = parentKey(items, above) ?? above.id
  const moving = [id, ...childrenOf(items, id).map((k) => k.id)]
  const rest = items.filter((i) => !moving.includes(i.id))
  const anchor = lastInBlock(rest, parent)
  commit(
    relocate(
      items.map((i) => (moving.includes(i.id) ? { ...i, parentId: parent } : i)),
      moving,
      anchor,
    ),
  )
  return true
}

/** ⇧Tab: a subtask becomes a thought of its own, just below its old group. */
export function outdentItem(id: string): boolean {
  const { items } = get()
  const item = items.find((i) => i.id === id)
  const parent = item && parentKey(items, item)
  if (!item || !parent) {
    toast('Already top-level')
    return false
  }
  const rest = items.filter((i) => i.id !== id)
  commit(
    relocate(
      items.map((i) => (i.id === id ? { ...i, parentId: null } : i)),
      [id],
      lastInBlock(rest, parent),
    ),
  )
  return true
}

export function replaceItems(items: Item[]) {
  commit(items)
  resetCursors()
}

export function clearDone() {
  const { items } = get()
  const finished = items.filter((i) => isDone(items, i))
  const n = finished.length
  if (!n) return toast('No completed items')
  const gone = new Set(finished.map((i) => i.id))
  commit(items.filter((i) => !gone.has(i.id)))
  toast(`Cleared ${n} completed`, 'mod+z')
}

export function clearAll() {
  if (!get().items.length) return toast('Already empty')
  commit([])
  resetCursors()
  toast('Fresh start', 'mod+z')
}

/** Adds pasted lines as new items (outside the editor). */
export function pasteLines(lines: string[]) {
  const s = get()
  const tail = treeOrder(s.items).at(-1)
  const selected = s.mode === 'dump' ? findItem(s.selectedId) : undefined
  const anchor = selected?.id ?? tail?.parentId ?? tail?.id ?? null
  // Pasting onto a subtask adds more subtasks to its parent.
  const ids = addItems(anchor, lines, selected ? parentKey(s.items, selected) : null)
  if (s.mode === 'dump') set({ selectedId: ids.at(-1) ?? null })
  toast(`Added ${ids.length} item${ids.length === 1 ? '' : 's'}`, 'mod+z')
}

function resetCursors() {
  set({
    selectedId: null,
    editing: null,
    decks: { sort: freshDeck(), plan: freshDeck() },
    trayEditing: null,
    landed: null,
    todayCursor: null,
  })
}

// ---------------------------------------------------------------- modes

const MODES: Mode[] = ['dump', 'sort', 'plan', 'today']

export function setMode(mode: Mode) {
  if (get().mode === mode) return
  set({ mode })
  resetCursors()
}

/** ⌥←/⌥→: step to the neighbouring screen, stopping at the ends like pages. */
export function cycleMode(dir: -1 | 1) {
  const i = MODES.indexOf(get().mode)
  const next = MODES[i + dir]
  if (next) setMode(next)
}

// ---------------------------------------------------------------- dump

let draftNonce = 0
const draftAfter = (afterId: string | null, seed = '', parentId: string | null = null): EditTarget => ({
  kind: 'draft',
  afterId,
  parentId,
  seed,
  nonce: ++draftNonce,
})

/** A new line after this thought: a sibling if it is a subtask, else a new top-level thought. */
function draftBelow(id: string, seed = ''): EditTarget {
  const item = findItem(id)
  return draftAfter(id, seed, item ? parentKey(get().items, item) : null)
}

/** A new subtask line: last under a parent, or right below the subtask you're on. */
function draftSub(id: string): EditTarget {
  const { items } = get()
  const item = items.find((i) => i.id === id)
  const parent = item && (parentKey(items, item) ?? item.id)
  if (!item || !parent) return draftAfter(id)
  return draftAfter(item.id === parent ? lastInBlock(items, parent) : item.id, '', parent)
}

export function startDraft(seed = '') {
  const s = get()
  const selected = findItem(s.selectedId)
  if (selected) return set({ editing: draftBelow(selected.id, seed) })
  // Nothing selected: a new thought at the end of the list, never a subtask of the last one.
  const tail = treeOrder(s.items).at(-1)
  set({ editing: draftAfter(tail ? (parentKey(s.items, tail) ?? tail.id) : null, seed) })
}

export function startEdit(id: string, caret: 'start' | 'end' = 'end') {
  set({ editing: { kind: 'item', id, caret }, selectedId: id })
}

export function sameTarget(e: Editing, target: EditTarget): boolean {
  if (!e || e.kind !== target.kind) return false
  return e.kind === 'item' ? e.id === (target as typeof e).id : e.nonce === (target as typeof e).nonce
}

export const isEditing = (target: EditTarget) => sameTarget(get().editing, target)

/** Saves the editor's text. Returns the item id it now lives on, or null if nothing remains. */
function commitEditor(target: EditTarget, value: string): string | null {
  const text = value.trim()
  if (target.kind === 'draft') return text ? addItems(target.afterId, [text], target.parentId)[0] : null
  if (!text) {
    removeItem(target.id)
    return null
  }
  updateText(target.id, text)
  return target.id
}

function fallbackSelection(target: EditTarget) {
  return target.kind === 'draft' ? target.afterId : neighbours(target.id).prev
}

export function editorEnter(target: EditTarget, value: string) {
  const fallback = fallbackSelection(target)
  const id = commitEditor(target, value)
  if (id) set({ editing: draftBelow(id), selectedId: id })
  else set({ editing: null, selectedId: fallback })
}

export function editorExit(target: EditTarget, value: string) {
  if (!isEditing(target)) return
  const fallback = fallbackSelection(target)
  const id = commitEditor(target, value)
  set({ editing: null, selectedId: id ?? fallback })
}

/** The thought visually above a draft line. */
function aboveDraft(target: Extract<EditTarget, { kind: 'draft' }>): string | null {
  if (!target.afterId) return null
  return target.parentId === null ? lastInBlock(get().items, target.afterId) : target.afterId
}

export function editorBackspaceEmpty(target: EditTarget) {
  if (target.kind === 'draft') {
    const prev = aboveDraft(target)
    set({ editing: prev ? { kind: 'item', id: prev, caret: 'end' } : null, selectedId: prev })
    return
  }
  const { prev } = neighbours(target.id)
  const at = treeOrder(get().items).findIndex((i) => i.id === target.id)
  removeItem(target.id)
  const after = treeOrder(get().items)
  const land = prev ?? after[Math.min(at, after.length - 1)]?.id ?? null
  set({ editing: prev ? { kind: 'item', id: prev, caret: 'end' } : null, selectedId: land })
}

export function editorMove(target: EditTarget, value: string, dir: -1 | 1) {
  const { items } = get()
  let prev: string | null
  let next: string | null
  if (target.kind === 'draft') {
    prev = aboveDraft(target)
    next = treeOrder(items)[draftIndex(items, target.afterId, target.parentId)]?.id ?? null
  } else {
    ;({ prev, next } = neighbours(target.id))
  }

  if (dir === -1) {
    if (!prev) return
    commitEditor(target, value)
    set({ editing: { kind: 'item', id: prev, caret: 'end' }, selectedId: prev })
    return
  }
  if (next) {
    commitEditor(target, value)
    set({ editing: { kind: 'item', id: next, caret: 'start' }, selectedId: next })
  } else if (target.kind === 'item') {
    const id = commitEditor(target, value)
    if (id) set({ editing: draftBelow(id), selectedId: id })
  }
}

export function editorPaste(target: EditTarget, merged: string, rest: string[]) {
  const fallback = fallbackSelection(target)
  const parent = target.kind === 'draft' ? target.parentId : parentKey(get().items, findItem(target.id)!)
  const last = transact(() => {
    const id = commitEditor(target, merged)
    const anchor = id ?? fallback
    return addItems(anchor, rest, parent).at(-1) ?? anchor
  })
  set({ editing: last ? draftBelow(last) : null, selectedId: last })
  toast(`Added ${rest.length + 1} items`, 'mod+z')
}

export function dumpEnter() {
  const { selectedId } = get()
  if (selectedId) startEdit(selectedId)
  else startDraft()
}

export function dumpSelect(dir: -1 | 1) {
  const { selectedId } = get()
  const items = treeOrder(get().items)
  if (!items.length) return
  const i = items.findIndex((it) => it.id === selectedId)
  const next = i === -1 ? (dir > 0 ? 0 : items.length - 1) : clamp(i + dir, 0, items.length - 1)
  set({ selectedId: items[next].id })
}

export function dumpDelete() {
  const item = findItem(get().selectedId)
  if (!item) return
  const at = treeOrder(get().items).findIndex((i) => i.id === item.id)
  const kids = removeItem(item.id)
  const after = treeOrder(get().items)
  set({ selectedId: after[Math.min(at, after.length - 1)]?.id ?? null })
  if (!kids) toast(`Deleted "${truncate(item.text)}"`, 'mod+z')
}

export function dumpMove(dir: -1 | 1) {
  const { selectedId } = get()
  if (selectedId) moveItem(selectedId, dir)
}

/** Tab / ⇧Tab on the selected thought. */
export function dumpIndent(dir: 1 | -1) {
  const { selectedId } = get()
  if (selectedId) (dir > 0 ? indentItem : outdentItem)(selectedId)
}

/** ⌥↵: add a subtask to the selected thought (or another one beside it, if it is a subtask). */
export function dumpAddSub() {
  const { selectedId } = get()
  if (selectedId) set({ editing: draftSub(selectedId) })
}

/** The same chord while typing: save this line, then open a subtask line under it. */
export function editorAddSub(target: EditTarget, value: string) {
  const id = commitEditor(target, value)
  if (id) set({ editing: draftSub(id), selectedId: id })
}

/** Tab / ⇧Tab while typing. A new line just changes where it will land; an existing one moves now. */
export function editorIndent(target: EditTarget, value: string, dir: 1 | -1) {
  const { items } = get()
  if (target.kind === 'draft') {
    if (dir > 0) {
      const above = target.afterId ? items.find((i) => i.id === target.afterId) : undefined
      if (target.parentId || !above) return toast(above ? 'Already a subtask. One level deep keeps it simple' : 'Nothing above to nest under')
      const parent = parentKey(items, above) ?? above.id
      set({ editing: { ...target, parentId: parent, afterId: lastInBlock(items, parent) } })
    } else {
      if (!target.parentId) return toast('Already top-level')
      set({ editing: { ...target, parentId: null, afterId: target.parentId } })
    }
    return
  }
  transact(() => {
    const text = value.trim()
    if (text) updateText(target.id, text)
    ;(dir > 0 ? indentItem : outdentItem)(target.id)
  })
}

export function dumpToggleDone() {
  const { selectedId } = get()
  if (selectedId) toggleDone(selectedId)
}

export function dumpEscape() {
  set({ selectedId: null })
}

// ---------------------------------------------------------------- sort + plan decks
//
// Sort and Plan work the same way. One thought is selected and shown in the tray.
// A filing key (Q W A S in Sort, 1–8 in Plan) applies at once and moves on to the
// next thought that still needs a decision. ↑/↓ walk the whole list, ←/→ jump
// between groups, and ⌫ brings back whatever was filed last.

export type DeckMode = 'sort' | 'plan'

const isDeck = (m: Mode): m is DeckMode => m === 'sort' || m === 'plan'

/** The deck's lists in reading order. Group 0 is the queue still waiting for a decision. */
function groupsFor(m: DeckMode): Item[][] {
  const { items } = get()
  return m === 'sort' ? sortGroups(items) : planGroups(items, todayKey())
}

const inDeck = (m: DeckMode, id: string) => groupsFor(m).some((g) => g.some((i) => i.id === id))

function currentIdFor(m: DeckMode): string | null {
  const { items, decks } = get()
  const { cursor } = decks[m]
  return m === 'sort' ? resolveSortCursor(items, cursor) : resolvePlanCursor(items, cursor, todayKey())
}

export const sortCurrent = () => findItem(currentIdFor('sort')) ?? null
export const planCurrent = () => findItem(currentIdFor('plan')) ?? null
export const trayCurrent = () => (get().mode === 'plan' ? planCurrent() : sortCurrent())

function setDeck(m: DeckMode, change: Partial<Deck>) {
  set((s) => ({ decks: { ...s.decks, [m]: { ...s.decks[m], ...change } } }))
}

function nothingHere(m: DeckMode) {
  if (!get().items.length) return toast('Nothing here yet. Dump some thoughts first', 'shift+1')
  if (m === 'sort') return toast('Everything is sorted', 'shift+3')
  toast('Nothing left to plan')
}

/**
 * Selects a thought outside the normal flow. Leaving the queue to look at filed
 * thoughts remembers your place, so the next filing key brings you back to it.
 */
function wander(m: DeckMode, to: string, exit: TrayExit) {
  const from = currentIdFor(m)
  const queue = groupsFor(m)[0]
  const queued = (id: string | null) => id !== null && queue.some((i) => i.id === id)
  const { resume } = get().decks[m]
  setDeck(m, { cursor: to, resume: queued(to) ? null : (resume ?? (queued(from) ? from : null)) })
  set({ trayExit: exit, trayEditing: null })
}

function exitToward(m: DeckMode, value: string | null): TrayExit {
  if (value === null) return { x: 0, y: -1 }
  if (m === 'sort') {
    const q = QUADRANT_BY_ID[value as Quadrant]
    return { x: q.col === 0 ? -1 : 1, y: q.row === 0 ? 1 : 2 }
  }
  const today = todayKey()
  const cols = planColumns(today)
  const i = cols.findIndex((c) => c.key === columnFor(value, today))
  return { x: (i - (cols.length - 1) / 2) / 2, y: 1.6 }
}

/** Files the selected thought (a quadrant in Sort, a slot in Plan) and moves on. */
export function deckFile(m: DeckMode, value: string | null) {
  const cur = m === 'sort' ? sortCurrent() : planCurrent()
  if (!cur) return nothingHere(m)
  const queueBefore = groupsFor(m)[0]
  const orderBefore = groupsFor(m).flat()
  patch(cur.id, m === 'sort' ? { quadrant: value as Quadrant | null } : { slot: value })

  // Back to where you left off if you wandered, else the next thought in the queue.
  const { resume, trail } = get().decks[m]
  let next =
    resume && resume !== cur.id && groupsFor(m)[0].some((i) => i.id === resume)
      ? resume
      : nextInQueue(queueBefore, cur.id)
  if (!next && !queueBefore.some((i) => i.id === cur.id)) {
    // Nothing queued and you were browsing filed thoughts: stay at the same place in the list.
    const i = orderBefore.findIndex((it) => it.id === cur.id)
    next = orderBefore[i + 1]?.id ?? orderBefore[i - 1]?.id ?? null
  }

  setDeck(m, { cursor: next, resume: null, trail: [...trail.filter((id) => id !== cur.id), cur.id].slice(-100) })
  const lands = value !== null && (m === 'sort' || columnFor(value, todayKey()) !== null)
  set((s) => ({
    trayExit: exitToward(m, value),
    trayEditing: null,
    landed: lands ? { id: cur.id, n: (s.landed?.n ?? 0) + 1 } : s.landed,
  }))
}

/** ↵: leave the selected thought as it is and move on. */
export function deckKeep(m: DeckMode) {
  const cur = m === 'sort' ? sortCurrent() : planCurrent()
  if (!cur) return nothingHere(m)
  deckFile(m, m === 'sort' ? cur.quadrant : cur.slot)
}

export function planFileDay(n: number) {
  const col = planColumns(todayKey())[n - 1]
  if (col) deckFile('plan', col.key)
}

/** ↑/↓: walk the whole list in reading order, stopping at the ends. */
export function deckMove(m: DeckMode, dir: -1 | 1) {
  const order = groupsFor(m).flat()
  if (!order.length) return nothingHere(m)
  const cur = currentIdFor(m)
  const i = order.findIndex((it) => it.id === cur)
  const j = i === -1 ? (dir > 0 ? 0 : order.length - 1) : clamp(i + dir, 0, order.length - 1)
  if (j !== i) wander(m, order[j].id, { x: 0, y: -dir * 0.6 })
}

/** ←/→: jump to the neighbouring quadrant or day, keeping roughly the same row. */
export function deckJump(m: DeckMode, dir: -1 | 1) {
  const groups = groupsFor(m)
  const cur = currentIdFor(m)
  let g = groups.findIndex((list) => list.some((i) => i.id === cur))
  const row = g === -1 ? 0 : groups[g].findIndex((i) => i.id === cur)
  if (g === -1) g = dir > 0 ? -1 : groups.length
  for (let k = g + dir; k >= 0 && k < groups.length; k += dir) {
    const list = groups[k]
    if (list.length) return wander(m, list[Math.min(row, list.length - 1)].id, { x: -dir * 0.8, y: 0 })
  }
}

/** ⌫: bring back the thought filed most recently (again to step further back). */
export function deckBack(m: DeckMode) {
  const cur = currentIdFor(m)
  const trail = [...get().decks[m].trail]
  while (trail.length) {
    const id = trail.pop()!
    if (id !== cur && inDeck(m, id)) {
      setDeck(m, { trail })
      return wander(m, id, { x: 0.8, y: 0 })
    }
  }
  setDeck(m, { trail })
  toast('Nothing filed yet')
}

// ---------------------------------------------------------------- shift+arrows: move the thought, keep it selected

function landHere(m: DeckMode, id: string, lands: boolean) {
  setDeck(m, { cursor: id })
  set((s) => ({ trayEditing: null, landed: lands ? { id, n: (s.landed?.n ?? 0) + 1 } : s.landed }))
}

/** Shift+arrows in Sort: slide the selected thought to the neighbouring quadrant. Up from the top row unsorts it. */
export function sortShift(dRow: number, dCol: number) {
  const cur = sortCurrent()
  if (!cur) return nothingHere('sort')
  let next: Quadrant | null
  if (!cur.quadrant) {
    // Unsorted sits above the grid: down or left enters Do, right enters Schedule.
    if (dRow < 0) return
    next = dCol > 0 ? 'schedule' : 'do'
  } else {
    const q = QUADRANT_BY_ID[cur.quadrant]
    const row = q.row + dRow
    const col = clamp(q.col + dCol, 0, 1)
    next = row < 0 ? null : QUADRANTS.find((x) => x.row === clamp(row, 0, 1) && x.col === col)!.id
  }
  if (next === cur.quadrant) return
  patch(cur.id, { quadrant: next })
  landHere('sort', cur.id, next !== null)
}

/** Shift+←/→ in Plan: a day earlier or later. Left of today unplans; right of Later stays in Later. */
export function planShift(dir: -1 | 1) {
  const cur = planCurrent()
  if (!cur) return nothingHere('plan')
  const today = todayKey()
  const keys = planColumns(today).map((c) => c.key)
  const col = columnFor(cur.slot, today)
  const i = col === null ? (dir > 0 ? 0 : -1) : keys.indexOf(col) + dir
  const next = i < 0 ? null : keys[Math.min(i, keys.length - 1)]
  if (next === col) return
  patch(cur.id, { slot: next })
  landHere('plan', cur.id, next !== null)
}

/** Shift+↑/↓ in Plan: reorder the selected thought within its day. */
export function planReorder(dir: -1 | 1) {
  const cur = planCurrent()
  if (!cur) return nothingHere('plan')
  const today = todayKey()
  const col = columnFor(cur.slot, today)
  if (col === null) return
  const list = itemsInColumn(get().items, col, today)
  const other = list[list.findIndex((i) => i.id === cur.id) + dir]
  if (!other) return
  const items = [...get().items]
  const a = items.findIndex((i) => i.id === cur.id)
  const b = items.findIndex((i) => i.id === other.id)
  ;[items[a], items[b]] = [items[b], items[a]]
  commit(items)
}

export function deckFocus(m: DeckMode, id: string) {
  wander(m, id, { x: 0, y: -1 })
}

// ---------------------------------------------------------------- tray (sort + plan)

export function trayEdit() {
  const cur = trayCurrent()
  if (cur) set({ trayEditing: cur.id })
}

export function trayCommit(id: string, value: string) {
  const text = value.trim()
  if (text) updateText(id, text)
  set({ trayEditing: null })
}

export function trayCancel() {
  set({ trayEditing: null })
}

export function trayToggleDone() {
  const cur = trayCurrent()
  if (cur) toggleDone(cur.id)
}

export function trayDelete() {
  const cur = trayCurrent()
  if (!cur) return
  removeItem(cur.id)
  toast(`Deleted "${truncate(cur.text)}"`, 'mod+z')
}

// ---------------------------------------------------------------- today

export function todayCurrent(): Item | null {
  const s = get()
  return findItem(resolveTodayCursor(s.items, s.todayCursor, todayKey())) ?? null
}

function nothingToday() {
  toast('Nothing planned for today', 'shift+3')
}

export function todayMove(dir: -1 | 1) {
  const list = todayList(get().items, todayKey())
  if (!list.length) return nothingToday()
  const cur = todayCurrent()
  const i = list.findIndex((it) => it.id === cur?.id)
  set({ todayCursor: list[clamp(i + dir, 0, list.length - 1)].id })
}

/** X / Space: tick it off, then move to the next thing still open. */
export function todayToggle() {
  const cur = todayCurrent()
  if (!cur) return nothingToday()
  patch(cur.id, { done: !cur.done })
  if (cur.done) return toast('Reopened', 'x')
  const s = get()
  if (s.focus?.id === cur.id) set({ focus: null })
  const list = todayList(s.items, todayKey())
  const i = list.findIndex((it) => it.id === cur.id)
  const next = [...list.slice(i + 1), ...list.slice(0, i)].find((it) => !it.done)
  set({ todayCursor: next?.id ?? cur.id })
  toast(next ? 'Done. Next up' : "Done. That's everything for today", 'mod+z')
}

/** T: not today. Moves it to tomorrow without guilt (and without losing it). */
export function todayDefer() {
  const cur = todayCurrent()
  if (!cur) return nothingToday()
  const list = todayList(get().items, todayKey())
  const i = list.findIndex((it) => it.id === cur.id)
  const next = list[i + 1] ?? list[i - 1]
  patch(cur.id, { slot: addDays(todayKey(), 1) })
  set({ todayCursor: next?.id ?? null })
  toast(`"${truncate(cur.text, 24)}" moved to tomorrow`, 'mod+z')
}

export function todayReorder(dir: -1 | 1) {
  const cur = todayCurrent()
  if (!cur) return nothingToday()
  const list = todayList(get().items, todayKey())
  const other = list[list.findIndex((it) => it.id === cur.id) + dir]
  if (!other) return
  const items = [...get().items]
  const a = items.findIndex((it) => it.id === cur.id)
  const b = items.findIndex((it) => it.id === other.id)
  ;[items[a], items[b]] = [items[b], items[a]]
  commit(items)
}

export function todayFocus(id: string) {
  set({ todayCursor: id })
}

// ---------------------------------------------------------------- focus timer

const FOCUS_MINUTES = 25

/** F: start a focus block on the selected thought, or stop the one running on it. */
export function focusToggle() {
  const cur = todayCurrent()
  if (!cur) return nothingToday()
  const { focus } = get()
  if (focus?.id === cur.id) return focusStop()
  set({ focus: { id: cur.id, endsAt: Date.now() + FOCUS_MINUTES * 60_000, minutes: FOCUS_MINUTES } })
  toast(`${FOCUS_MINUTES} minutes on "${truncate(cur.text, 24)}"`, 'f')
}

export function focusStop() {
  if (!get().focus) return toast('No focus block running')
  set({ focus: null })
  toast('Focus block stopped')
}

/** Called by the timer when the block runs out. */
export function focusFinished() {
  const { focus, items } = get()
  if (!focus) return
  const item = items.find((i) => i.id === focus.id)
  set({ focus: null })
  toast(item ? `Time. How did "${truncate(item.text, 24)}" go? X to tick it off` : 'Focus block finished')
}

// ---------------------------------------------------------------- navigation

export function jumpTo(id: string) {
  const { mode } = get()
  if (isDeck(mode) && inDeck(mode, id)) return deckFocus(mode, id)
  if (mode === 'today' && todayList(get().items, todayKey()).some((i) => i.id === id)) return todayFocus(id)
  setMode('dump')
  set({ selectedId: id })
}

// ---------------------------------------------------------------- overlays + settings

export function openPalette(seed = '') {
  set((s) => ({ palette: { open: true, seed, nonce: s.palette.nonce + 1 }, helpOpen: false }))
}

export function closePalette() {
  set((s) => ({ palette: { ...s.palette, open: false } }))
}

export function toggleHelp() {
  set((s) => ({ helpOpen: !s.helpOpen, palette: { ...s.palette, open: false } }))
}

export function cycleTheme() {
  const order = ['system', 'dark', 'light'] as const
  const next = order[(order.indexOf(get().theme) + 1) % order.length]
  set({ theme: next })
  toast(`Theme: ${next}`)
}

export function toggleHud() {
  const hud = !get().hud
  set({ hud })
  toast(hud ? 'Keystroke overlay on' : 'Keystroke overlay off')
}
