import { addDays, columnFor, planColumns, todayKey } from '../lib/dates'
import { mergeItems } from '../lib/export'
import { askForNotifications, notificationsBlocked, notify } from '../lib/notify'
import { fmt, PRESETS, stepMinutes } from '../lib/duration'
import { uid } from '../lib/id'
import { QUADRANTS, QUADRANT_BY_ID } from '../lib/quadrants'
import { activeId, advance, effMinutes, leftovers, startRun } from '../lib/session'
import {
  nextInQueue,
  archiveOrder,
  archivedIds,
  live,
  openInSession,
  planGroups,
  resolveArchiveCursor,
  resolvePlanCursor,
  resolveSortCursor,
  resolveTodayCursor,
  sortGroups,
  todayList,
  todaySessions,
} from '../lib/selectors'
import { childrenOf, draftIndex, isDone, lastInBlock, parentKey, treeOrder } from '../lib/tree'
import type { Item, Mode, Quadrant } from '../lib/types'
import { type Deck, type Editing, freshDeck, getState as get, setState as set, type State, type TrayExit } from './store'

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
    if (!j || j.quadrant !== i.quadrant || j.slot !== i.slot || j.text !== i.text || j.done !== i.done || j.parentId !== i.parentId || j.minutes !== i.minutes || j.session !== i.session) return i.id
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
    doneAt: null,
    parentId: parent?.id ?? null,
    minutes: null,
    session: parent?.session ?? 1,
  }
}

const findItem = (id: string | null) => (id ? get().items.find((i) => i.id === id) : undefined)

/** The thoughts Dump shows: everything that isn't in the archive. */
const liveItems = () => live(get().items)

/** Previous and next thought as Dump shows them, subtasks included. */
function neighbours(id: string) {
  const order = treeOrder(liveItems())
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
  // A thought that moves to another day starts that day in the first session.
  if (change.slot !== undefined && change.slot !== item.slot && change.session === undefined) change = { ...change, session: 1 }
  // Ticking a thought off records the day, which is what moves it to the archive tomorrow.
  if (change.done !== undefined && change.done !== item.done) change = { ...change, doneAt: change.done ? Date.now() : null }
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

/**
 * Ticks a thought off, and it goes straight to the Archive. A parent has no done flag of its own:
 * ticking it ticks every subtask, or clears them if all were done (only possible from the Archive).
 */
export function toggleDone(id: string) {
  const item = findItem(id)
  if (!item) return
  const kids = childrenOf(get().items, id)
  if (kids.length) {
    const allDone = kids.every((k) => k.done)
    const now = Date.now()
    commit(get().items.map((i) => (i.parentId === id ? { ...i, done: !allDone, doneAt: allDone ? null : i.done ? i.doneAt : now } : i)))
    return toast(allDone ? 'Marked not done' : `Done, with ${plural(kids.length, 'subtask')}. Archived`, 'mod+z')
  }
  patch(id, { done: !item.done })
  toast(item.done ? 'Marked not done' : 'Done. Archived', 'mod+z')
}

/** Moves a thought up or down among its siblings; a parent takes its subtasks with it. */
export function moveItem(id: string, dir: -1 | 1) {
  const items = [...get().items]
  const item = items.find((it) => it.id === id)
  if (!item) return
  const key = parentKey(items, item)
  const hidden = archivedIds(items)
  const siblings = items.filter((it) => parentKey(items, it) === key && !hidden.has(it.id))
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
  const order = treeOrder(live(items))
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

/** Brings in thoughts from a file without touching what is here. Returns how many were new. */
export function importItems(incoming: Item[]): { added: number; skipped: number } {
  const { items, added, skipped } = mergeItems(get().items, incoming)
  if (added) commit(items)
  return { added, skipped }
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
  set({ run: null })
  toast('Fresh start', 'mod+z')
}

/** Adds pasted lines as new items (outside the editor). */
export function pasteLines(lines: string[]) {
  const s = get()
  const tail = treeOrder(liveItems()).at(-1)
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
    archiveCursor: null,
    todayAdd: null,
  })
}

// ---------------------------------------------------------------- modes

// The Archive is off to the side: it isn't one of the screens ⌥←/⌥→ step through.
const MODES: Mode[] = ['dump', 'sort', 'plan', 'today']

export function setMode(mode: Mode) {
  const from = get().mode
  if (from === mode) return
  set(mode === 'archive' ? { mode, archiveFrom: from } : { mode })
  resetCursors()
}

/** ⌥←/⌥→: step to the neighbouring screen, stopping at the ends like pages. */
export function cycleMode(dir: -1 | 1) {
  if (get().mode === 'archive') return archiveBack()
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
  const tail = treeOrder(liveItems()).at(-1)
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
  const at = treeOrder(liveItems()).findIndex((i) => i.id === target.id)
  removeItem(target.id)
  const after = treeOrder(liveItems())
  const land = prev ?? after[Math.min(at, after.length - 1)]?.id ?? null
  set({ editing: prev ? { kind: 'item', id: prev, caret: 'end' } : null, selectedId: land })
}

export function editorMove(target: EditTarget, value: string, dir: -1 | 1) {
  const items = liveItems()
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
  const items = treeOrder(liveItems())
  if (!items.length) return
  const i = items.findIndex((it) => it.id === selectedId)
  const next = i === -1 ? (dir > 0 ? 0 : items.length - 1) : clamp(i + dir, 0, items.length - 1)
  set({ selectedId: items[next].id })
}

export function dumpDelete() {
  const item = findItem(get().selectedId)
  if (!item) return
  const at = treeOrder(liveItems()).findIndex((i) => i.id === item.id)
  const kids = removeItem(item.id)
  const after = treeOrder(liveItems())
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

// ---------------------------------------------------------------- time estimates

/** The thought the selected screen is showing: the tray card in Sort and Plan, the highlighted row in Today. */
function estimateTarget(): Item | null {
  const { mode } = get()
  if (mode === 'sort') return sortCurrent()
  if (mode === 'plan') return planCurrent()
  if (mode === 'today') return todayCurrent()
  return null
}

function noTarget() {
  toast(get().mode === 'dump' ? 'Estimates are set in Sort, Plan and Today' : 'Nothing selected')
}

/** 1–6 in Sort: set how long it takes. The card stays put; filing it is a separate key. */
export function estimateSet(minutes: number | null) {
  const cur = estimateTarget()
  if (!cur) return noTarget()
  patch(cur.id, { minutes })
}

export const estimatePreset = (n: number) => estimateSet(PRESETS[n - 1] ?? null)

/** = / -: a step longer or shorter. */
export function estimateStep(dir: 1 | -1) {
  const cur = estimateTarget()
  if (!cur) return noTarget()
  patch(cur.id, { minutes: stepMinutes(cur.minutes, dir) })
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

/** X / Space: tick it off, which sends it to the Archive, and move to the next task. */
export function todayToggle() {
  const cur = todayCurrent()
  if (!cur) return nothingToday()
  const list = todayList(get().items, todayKey())
  const i = list.findIndex((it) => it.id === cur.id)
  const next = [...list.slice(i + 1), ...list.slice(0, i)][0]
  patch(cur.id, { done: true })
  set({ todayCursor: next?.id ?? null })
  toast(next ? 'Done. Archived. Next up' : "Done. That's everything for today", 'mod+z')
  sessionSync() // a running session moves straight on to the next task
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
  sessionSync()
}

// ---------------------------------------------------------------- add on Today
//
// N opens a line at the top of Today. Type a task and ↵ puts it in today's plan and opens the
// next line. To say what it is first, ↓ moves down into the options (quadrant, then time):
// ←/→ walk along a row, ↑/↓ change row, ↵ picks (again to clear), and ⇧↵ adds the task from
// anywhere. What you picked stays picked until the line closes.

/** The rows of options under the add line. */
export const ADD_OPTIONS = {
  quadrant: QUADRANTS.filter((q) => q.id !== 'drop').map((q) => q.id), // a dropped task has no place in today
  minutes: PRESETS,
}
const ADD_ROWS = [ADD_OPTIONS.quadrant, ADD_OPTIONS.minutes] as const

export function todayAddOpen() {
  if (!get().todayAdd) set({ todayAdd: { quadrant: null, minutes: null, cursor: null } })
}

/** Picks a quadrant for what's being added; picking the same one again clears it. */
export function todayAddQuadrant(quadrant: Quadrant) {
  const add = get().todayAdd
  if (add) set({ todayAdd: { ...add, quadrant: add.quadrant === quadrant ? null : quadrant } })
}

export function todayAddMinutes(minutes: number) {
  const add = get().todayAdd
  if (add) set({ todayAdd: { ...add, minutes: add.minutes === minutes ? null : minutes } })
}

/** Where a row's cursor should start: on what is picked there, else the first option. */
const startCol = (add: NonNullable<State['todayAdd']>, row: number) =>
  Math.max(0, (ADD_ROWS[row] as readonly unknown[]).indexOf(row === 0 ? add.quadrant : add.minutes))

/** Arrow keys on the options. Returns false when the arrow isn't for them (so the text can have it). */
export function todayAddArrow(dir: 'up' | 'down' | 'left' | 'right'): boolean {
  const add = get().todayAdd
  if (!add) return false
  const at = add.cursor
  const move = (cursor: { row: number; col: number } | null) => set({ todayAdd: { ...add, cursor } })
  if (!at) {
    if (dir !== 'down') return false
    move({ row: 0, col: startCol(add, 0) })
  } else if (dir === 'left' || dir === 'right') {
    const col = clamp(at.col + (dir === 'left' ? -1 : 1), 0, ADD_ROWS[at.row].length - 1)
    move({ row: at.row, col })
  } else {
    const row = at.row + (dir === 'down' ? 1 : -1)
    move(row < 0 ? null : row >= ADD_ROWS.length ? at : { row, col: startCol(add, row) })
  }
  return true
}

/** ↵ on an option: pick it, or clear it if it was already picked. */
export function todayAddPick() {
  const cursor = get().todayAdd?.cursor
  if (!cursor) return
  if (cursor.row === 0) todayAddQuadrant(ADD_OPTIONS.quadrant[cursor.col])
  else todayAddMinutes(ADD_OPTIONS.minutes[cursor.col])
}

/** Back to the text: typing, ⌫ or ↑ from the first row. */
export function todayAddBackToText() {
  const add = get().todayAdd
  if (add?.cursor) set({ todayAdd: { ...add, cursor: null } })
}

/** Adds one task per non-empty line to today's plan, filed as the chips say. Returns the last one's id. */
function todayAddTasks(texts: string[]): string | null {
  const add = get().todayAdd
  const here = todayCurrent()?.session ?? 1
  const created = texts
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => ({
      ...makeItem(t),
      quadrant: add?.quadrant ?? null,
      minutes: add?.minutes ?? null,
      slot: todayKey(),
      session: here, // alongside the task you were on
    }))
  if (!created.length) return null
  commit([...get().items, ...created])
  const id = created.at(-1)!.id
  set({ todayCursor: id })
  return id
}

/** ↵: add it and stay on the line for the next one. An empty line closes instead. */
export function todayAddEnter(value: string) {
  if (!todayAddTasks([value])) return set({ todayAdd: null })
  todayAddBackToText()
}

/** Esc, ⌫ on an empty line, clicking away: keep what was typed, then close. */
export function todayAddClose(value: string) {
  if (!get().todayAdd) return
  todayAddTasks([value])
  set({ todayAdd: null })
}

/** Pasting several lines adds them all, each filed the same way. */
export function todayAddPaste(merged: string, rest: string[]) {
  const n = [merged, ...rest].filter((t) => t.trim()).length
  todayAddTasks([merged, ...rest])
  toast(`Added ${n} ${n === 1 ? 'task' : 'tasks'} to today`, 'mod+z')
}

export function todayFocus(id: string) {
  set({ todayCursor: id })
}

// ---------------------------------------------------------------- work sessions
//
// Today's tasks can be split into sessions (⇧← / ⇧→ moves the selected task between them). F starts
// the session the selected task is in: it walks through the open tasks, each for as long as its
// estimate, and the clock runs down from the total. Nothing is ticked off for you. When the last
// window closes, what's still open is yours to finish, give more time, and carry on with.

const sessionName = (session: number) => {
  const i = todaySessions(get().items, todayKey()).findIndex((g) => g.session === session)
  return `Session ${i === -1 ? session : i + 1}`
}

const openIds = (session: number) => new Set(openInSession(get().items, todayKey(), session).map((i) => i.id))

const totalMinutes = (tasks: Item[]) => tasks.reduce((n, t) => n + effMinutes(t), 0)

/** F: start the selected task's session, or stop the one running. */
export function sessionToggle() {
  if (get().run) return sessionStop()
  sessionStart()
}

/** ↵: start the selected task's session, or carry on after time's up. Never stops one. */
export function sessionStart() {
  const { run } = get()
  if (run) return run.phase === 'over' ? sessionCarryOn() : undefined
  const cur = todayCurrent()
  if (!cur) return nothingToday()
  const tasks = openInSession(get().items, todayKey(), cur.session)
  const started = startRun(cur.session, tasks, Date.now())
  if (!started) return toast('Everything in this session is done')
  set({ run: started, todayCursor: tasks[0].id })
  askForNotifications()
  toast(`${sessionName(cur.session)}: ${fmt(totalMinutes(tasks))} to work through`, 'f')
  if (notificationsBlocked()) toast('Notifications are blocked here, so time-ups only show in this tab')
}

export function sessionStop() {
  if (!get().run) return toast('No session running')
  set({ run: null })
  toast('Session stopped')
}

/** After time's up: start another round over what is still open, using the times as they are now. */
export function sessionCarryOn() {
  const { run } = get()
  if (!run || run.phase !== 'over') return
  const tasks = openInSession(get().items, todayKey(), run.session)
  const next = startRun(run.session, tasks, Date.now())
  if (!next) return sessionFinished(run.session)
  set({ run: next, todayCursor: tasks[0].id })
  toast(`Carrying on: ${fmt(totalMinutes(tasks))} for ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`)
}

function sessionFinished(session: number) {
  const name = sessionName(session)
  const another = todaySessions(get().items, todayKey()).find((g) => g.session !== session)
  set({ run: null })
  const more = another ? ` Next: ${sessionName(another.session)}` : ''
  toast(`${name} done. Nice work.${more}`)
}

/**
 * Brings the running session up to date: closes windows that have run out, passes over tasks that
 * were ticked off, and tells you when time is up. Called every second while a session runs.
 */
export function sessionSync() {
  const { run, items } = get()
  if (!run) return
  const open = openIds(run.session)
  // After time is up the session ends once the last unfinished task is ticked off.
  if (run.phase === 'over') return leftovers(run, open).length ? undefined : sessionFinished(run.session)
  const { run: next, timedOut } = advance(run, items, open, Date.now())
  if (next === run) return

  const left = leftovers(next, open)
  if (next.phase === 'over' && !left.length) return sessionFinished(run.session)

  const active = activeId(next)
  set({ run: next, todayCursor: next.phase === 'over' ? left[0] : (active ?? get().todayCursor) })
  const name = sessionName(run.session)
  const text = (id: string | null | undefined) => truncate(items.find((i) => i.id === id)?.text ?? '', 30)

  if (next.phase === 'over') {
    const body = `${left.length} not finished. Tick off what's done, give the rest more time, then carry on.`
    if (timedOut.length) notify(`${name} is over`, body)
    return toast(`${name} is over. ${left.length} not finished`)
  }
  if (!timedOut.length) return // moved on because a task was ticked off or removed: no alarm needed
  const upNext = `Next: ${text(active)}`
  notify(`Time's up: ${text(timedOut.at(-1))}`, upNext)
  toast(`Time's up on "${text(timedOut.at(-1))}". ${upNext}`)
}

/** ⇧← / ⇧→: move the selected task to the previous or next session. Past the last one starts a new session. */
export function todayMoveSession(dir: -1 | 1) {
  const cur = todayCurrent()
  if (!cur) return nothingToday()
  const groups = todaySessions(get().items, todayKey())
  const at = groups.findIndex((g) => g.session === cur.session)
  const here = groups[at]
  let session: number | undefined
  if (dir < 0) session = groups[at - 1]?.session
  else session = groups[at + 1]?.session ?? (here.items.length > 1 ? here.session + 1 : undefined)
  if (session === undefined) return
  patch(cur.id, { session })
  set({ todayCursor: cur.id }) // the selection stays on the task you moved
}

// ---------------------------------------------------------------- archive

export function archiveCurrent(): Item | null {
  const s = get()
  return findItem(resolveArchiveCursor(s.items, s.archiveCursor)) ?? null
}

/** ⌫ / esc: back to the screen the Archive was opened from. */
export function archiveBack() {
  const { archiveFrom } = get()
  setMode(archiveFrom === 'archive' ? 'dump' : archiveFrom)
}

export function archiveFocus(id: string) {
  set({ archiveCursor: id })
}

export function archiveMove(dir: -1 | 1) {
  const list = archiveOrder(get().items)
  if (!list.length) return toast('Nothing archived yet')
  const i = list.findIndex((it) => it.id === archiveCurrent()?.id)
  set({ archiveCursor: list[clamp(i + dir, 0, list.length - 1)].id })
}

/** The thought under the cursor, and the one to land on once it leaves the archive. */
function archiveTarget() {
  const cur = archiveCurrent()
  if (!cur) return null
  const list = archiveOrder(get().items)
  const i = list.findIndex((it) => it.id === cur.id)
  return { cur, after: (list[i + 1] ?? list[i - 1])?.id ?? null }
}

/** X: it wasn't finished after all. It leaves the archive and is open again. */
export function archiveReopen() {
  const t = archiveTarget()
  if (!t) return toast('Nothing archived yet')
  patch(t.cur.id, { done: false })
  set({ archiveCursor: t.after })
  toast(`Reopened "${truncate(t.cur.text)}"`, 'mod+z')
}

export function archiveDelete() {
  const t = archiveTarget()
  if (!t) return toast('Nothing archived yet')
  removeItem(t.cur.id)
  set({ archiveCursor: t.after })
  toast(`Deleted "${truncate(t.cur.text)}"`, 'mod+z')
}

// ---------------------------------------------------------------- navigation

export function jumpTo(id: string) {
  const { mode } = get()
  if (isDeck(mode) && inDeck(mode, id)) return deckFocus(mode, id)
  if (mode === 'today' && todayList(get().items, todayKey()).some((i) => i.id === id)) return todayFocus(id)
  if (archivedIds(get().items).has(id)) {
    setMode('archive')
    return archiveFocus(id)
  }
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
