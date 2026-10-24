import { addDays, columnFor, isDateSlot, LATER, planColumns, todayKey } from '../lib/dates'
import { mergeItems } from '../lib/export'
import { CLEARED, FIELD_LABEL, fieldOptions, type Field, type FieldOption, type SessionChoice } from '../lib/fields'
import { askForNotifications, notificationsBlocked, notify } from '../lib/notify'
import { fmt, PRESETS, stepMinutes } from '../lib/duration'
import { uid } from '../lib/id'
import { QUADRANTS } from '../lib/quadrants'
import { activeId, advance, effMinutes, endPause, leftovers, pauseLeftMs, startRun, taskClock, windowOf } from '../lib/session'
import { parsePause, PAUSE_PRESETS } from '../lib/interrupt'
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
  GAPS,
  gapsOf,
  isPlannable,
  listOf,
  quickLane,
  settled,
  sortGroups,
  todayList,
  todaySessions,
  visibleInDump,
  type Gap,
} from '../lib/selectors'
import { childrenOf, draftIndex, isDone, lastInBlock, leaves, parentKey, treeOrder } from '../lib/tree'
import type { Item, Mode, Quadrant, Slot, View } from '../lib/types'
import { whenOptions } from '../lib/when'
import { type Deck, type Editing, freshDeck, getState as get, setState as set, type Sheet, type State, type TrayExit } from './store'

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
    if (!j || j.quadrant !== i.quadrant || j.slot !== i.slot || j.text !== i.text || j.done !== i.done || j.parentId !== i.parentId || j.minutes !== i.minutes || j.session !== i.session || j.manual !== i.manual || j.main !== i.main) return i.id
  }
  return b.find((j) => !a.some((i) => i.id === j.id))?.id ?? null
}

export function undo() {
  const s = get()
  const prev = s.past.at(-1)
  if (!prev) return toast('Nothing to undo')
  const changed = changedId(prev, s.items)
  const hidden = settled(s.items)
  set({ items: prev, past: s.past.slice(0, -1), future: [s.items, ...s.future], editing: null, picked: null })
  sessionReopen(s.items)
  // A thought that undo brings back out of hiding is selected, so you can see what came back.
  if (s.mode === 'dump' && changed && hidden.has(changed) && liveItems().some((i) => i.id === changed)) set({ selectedId: changed })
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

/** The thoughts Dump shows: everything open, less the ones already sorted and planned (unless you asked to see them). */
const liveItems = () => visibleInDump(get().items, get().showPlanned)

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

/** `manual` with some screens' places dropped, or undefined once none is left. */
function withoutPlaces(manual: Item['manual'], views: View[]): Item['manual'] {
  const left = Object.entries(manual ?? {}).filter(([v]) => !views.includes(v as View))
  return left.length ? Object.fromEntries(left) : undefined
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
  // A thought that lands in another list loses the place you gave it in the old one.
  const moved = (['sort', 'plan', 'today'] as const).filter(
    (v) =>
      item.manual?.[v] !== undefined &&
      (v === 'sort' ? change.quadrant !== undefined && change.quadrant !== item.quadrant
      : v === 'plan' ? change.slot !== undefined && change.slot !== item.slot
      : (change.slot !== undefined && change.slot !== item.slot) || (change.session !== undefined && change.session !== item.session)),
  )
  if (moved.length) change = { ...change, manual: withoutPlaces(item.manual, moved) }
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

/** Deletes a thought and its subtasks. Returns how many subtasks went with it (and says so, unless `quiet`). */
export function removeItem(id: string, quiet = false): number {
  const item = findItem(id)
  const kids = childrenOf(get().items, id).length
  commit(get().items.filter((i) => i.id !== id && i.parentId !== id))
  if (item && kids && !quiet) toast(`Deleted "${truncate(item.text)}" and ${plural(kids, 'subtask')}`, 'mod+z')
  return kids
}

/**
 * Ticks a thought off, and it goes straight to the Archive. A parent has no done flag of its own:
 * ticking it ticks every subtask, or clears them if all were done (only possible from the Archive).
 */
export function toggleDone(id: string, quiet = false) {
  const item = findItem(id)
  if (!item) return
  const kids = childrenOf(get().items, id)
  if (kids.length) {
    const allDone = kids.every((k) => k.done)
    const now = Date.now()
    commit(get().items.map((i) => (i.parentId === id ? { ...i, done: !allDone, doneAt: allDone ? null : i.done ? i.doneAt : now } : i)))
    if (!quiet) toast(allDone ? 'Marked not done' : `Done, with ${plural(kids.length, 'subtask')}. Archived`, 'mod+z')
    return
  }
  patch(id, { done: !item.done })
  if (!quiet) toast(item.done ? 'Marked not done' : 'Done. Archived', 'mod+z')
}

/** Picked thoughts less the subtasks whose parent is picked too: acting on the parent covers them. */
function covering(ids: string[]): string[] {
  const picked = new Set(ids)
  return ids.filter((id) => {
    const parent = findItem(id)?.parentId
    return !(parent && picked.has(parent))
  })
}

/** Moves a thought up or down among its siblings; a parent takes its subtasks with it. */
export function moveItem(id: string, dir: -1 | 1) {
  const items = [...get().items]
  const item = items.find((it) => it.id === id)
  if (!item) return
  const key = parentKey(items, item)
  const shown = new Set(liveItems().map((it) => it.id))
  const siblings = items.filter((it) => parentKey(items, it) === key && shown.has(it.id))
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

/**
 * Takes the sorting and planning back off everything still open: no lane, day, time or session.
 * The thoughts stay (and so do finished ones, in the Archive), so Sort and Plan can be done again.
 */
export function unorganise() {
  const { items } = get()
  const open = new Set(live(items).map((i) => i.id))
  const organised = (i: Item) => i.quadrant !== null || i.slot !== null || i.minutes !== null || i.session !== 1
  const n = leaves(items).filter((i) => open.has(i.id) && organised(i)).length
  if (!n) return toast('Nothing is sorted or planned yet')
  commit(items.map((i) => (open.has(i.id) ? { ...i, quadrant: null, slot: null, minutes: null, session: 1, manual: undefined, main: undefined } : i)))
  resetCursors()
  sessionSync() // a running session has nothing left to run
  toast(`Cleared lane, day and time on ${plural(n, 'thought')}`, 'mod+z')
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
  // Sessions mode has one place for a pasted list: today's plan, no lane, no day to choose.
  if (s.workMode === 'sessions') {
    todayAddTasks(lines)
    return toast(`Added ${plural(lines.length, 'task')} to today`, 'mod+z')
  }
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
    landed: null,
    todayCursor: null,
    archiveCursor: null,
    todayAdd: null,
    sheet: null,
    picked: null,
    pausing: false,
    sessionRename: null,
  })
}

// ---------------------------------------------------------------- modes

// The Archive is off to the side: it isn't one of the screens ⌥←/⌥→ step through.
const MODES: Mode[] = ['dump', 'sort', 'plan', 'today']

export function setMode(mode: Mode) {
  const from = get().mode
  if (from === mode) return
  if (get().workMode === 'sessions') return toast('Sessions mode keeps only Today. Switch it off to use the other screens')
  set(mode === 'archive' ? { mode, archiveFrom: from } : { mode })
  resetCursors()
}

/** ⌥←/⌥→: step to the neighbouring screen, stopping at the ends like pages. */
export function cycleMode(dir: -1 | 1) {
  if (get().workMode === 'sessions') return
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
  set({ selectedId: items[next].id, picked: null })
}

/** ⌘⌫: delete the selected thought (or the picked ones) and select what's next to it. */
export function dumpDelete() {
  const item = findItem(get().selectedId)
  if (!item) return
  const ids = covering(targetIds(item.id))
  const at = treeOrder(liveItems()).findIndex((i) => i.id === item.id)
  const kids = transact(() => ids.reduce((n, id) => n + removeItem(id, true), 0))
  const after = treeOrder(liveItems())
  set({ selectedId: after[Math.min(at, after.length - 1)]?.id ?? null, picked: null })
  const what = ids.length > 1 ? plural(ids.length, 'thought') : `"${truncate(item.text)}"`
  toast(`Deleted ${what}${kids ? ` and ${plural(kids, 'subtask')}` : ''}`, 'mod+z')
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

/** Ticks off the selected thought and selects what was next to it (the thought leaves Dump for the Archive). */
export function dumpToggleDone() {
  const { selectedId } = get()
  if (!selectedId) return toast('Select a thought first')
  const ids = covering(targetIds(selectedId))
  const order = treeOrder(liveItems())
  if (ids.length > 1) {
    transact(() => ids.forEach((id) => toggleDone(id, true)))
    toast(`Done. Archived ${plural(ids.length, 'thought')}`, 'mod+z')
  } else toggleDone(selectedId)
  set({ picked: null })
  landBeside(selectedId, order)
}

export function dumpEscape() {
  set({ selectedId: null, picked: null })
}

/** If a thought just left Dump's list, select its neighbour (next one down, else the one above). */
function landBeside(id: string, before: Item[]) {
  const shown = new Set(liveItems().map((i) => i.id))
  if (shown.has(id)) return
  const at = before.findIndex((i) => i.id === id)
  if (at === -1) return // it was never in the list (opened from search): keep the selection where it is
  const near = [...before.slice(at + 1), ...before.slice(0, at).reverse()].find((i) => shown.has(i.id))
  set({ selectedId: near?.id ?? null })
}

/** Shows or hides the thoughts that are sorted and planned. */
export function togglePlanned() {
  const showPlanned = !get().showPlanned
  set({ showPlanned })
  if (!showPlanned) {
    const selected = get().selectedId
    if (selected && !liveItems().some((i) => i.id === selected)) set({ selectedId: null })
  }
  toast(showPlanned ? 'Showing sorted and planned thoughts' : 'Sorted and planned thoughts hidden')
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
  set({ trayExit: exit, picked: null })
}

function exitToward(m: DeckMode, value: string | null): TrayExit {
  if (value === null) return { x: 0, y: -1 }
  if (m === 'sort') return { x: QUADRANTS.findIndex((q) => q.id === value) - 1, y: 1.4 }
  const today = todayKey()
  const cols = planColumns(today)
  const i = cols.findIndex((c) => c.key === columnFor(value, today))
  return { x: (i - (cols.length - 1) / 2) / 2, y: 1.6 }
}

// ---------------------------------------------------------------- the 2-minute run
//
// Once nothing is left to sort, Sort's card walks through the 2-minute tasks: do it now and ⌘K,
// or Space for the next one. Each key moves on within the lane, round to the start, until it's empty.

/** The 2-minute lane as it stood, when the selected thought is in it and nothing is left to sort. */
function quickRun(m: DeckMode, cur: Item, queue: Item[]): Item[] | null {
  return m === 'sort' && !queue.length && cur.quadrant === 'quick' ? quickLane(get().items) : null
}

/** The next 2-minute task after `id` that is still waiting, round to the start of the lane. */
function nextInRun(before: Item[], id: string): string | null {
  const lane = new Set(quickLane(get().items).map((i) => i.id))
  const i = before.findIndex((it) => it.id === id)
  return [...before.slice(i + 1), ...before.slice(0, i)].find((it) => lane.has(it.id))?.id ?? null
}

// ---------------------------------------------------------------- picking several (⇧↑ ⇧↓)
//
// ⇧↑/⇧↓ highlight a run of thoughts, like selecting text. Every key that acts on "the selected
// thought" (filing, time, day, session, done, delete, when) then acts on all of them. Moving the
// selection any other way, or esc, goes back to one.

/** What the keys act on: everything picked, else just the selected thought. */
function targetIds(cursor: string | null): string[] {
  const picked = get().picked?.ids.filter((id) => findItem(id))
  if (picked && picked.length > 1 && cursor && picked.includes(cursor)) return picked
  return cursor ? [cursor] : []
}

/** The thought selected on this screen and the screen's order (the one ↑/↓ walks), if it has one to pick in. */
function pickScope(): { cursor: string | null; order: string[] } | null {
  const { mode, items, selectedId } = get()
  if (mode === 'dump') {
    const order = treeOrder(liveItems()).map((i) => i.id)
    return { cursor: selectedId && order.includes(selectedId) ? selectedId : null, order }
  }
  if (mode === 'sort' || mode === 'plan') {
    return { cursor: currentIdFor(mode), order: groupsFor(mode).flat().map((i) => i.id) }
  }
  if (mode === 'today') return { cursor: todayCurrent()?.id ?? null, order: todayList(items, todayKey()).map((i) => i.id) }
  return null
}

/** ⇧↑/⇧↓: move the selection a step and highlight everything between it and where it started. */
export function pickExtend(dir: -1 | 1) {
  const scope = pickScope()
  const { mode } = get()
  if (!scope?.cursor) return
  const { cursor, order } = scope
  const i = order.indexOf(cursor)
  if (i === -1) return
  const j = clamp(i + dir, 0, order.length - 1)
  const held = get().picked?.anchor
  const anchor = held && order.includes(held) ? held : cursor
  if (j !== i) {
    if (isDeck(mode)) wander(mode, order[j], { x: 0, y: -dir * 0.6 })
    else if (mode === 'dump') set({ selectedId: order[j] })
    else set({ todayCursor: order[j] })
  }
  const a = order.indexOf(anchor)
  const ids = order.slice(Math.min(a, j), Math.max(a, j) + 1)
  set({ picked: ids.length > 1 ? { anchor, ids } : null })
}

/** esc: back to just the selected one. */
export function pickClear() {
  if (get().picked) set({ picked: null })
}

const pickedNote = (n: number) => (n > 1 ? ` ${n} thoughts` : '')

/** Files the selected thought (a lane in Sort, a slot in Plan) and moves on. Files all picked ones together. */
export function deckFile(m: DeckMode, value: string | null) {
  const cur = m === 'sort' ? sortCurrent() : planCurrent()
  if (!cur) return nothingHere(m)
  const ids = targetIds(cur.id)
  const filing = new Set(ids)
  const queueBefore = groupsFor(m)[0]
  const orderBefore = groupsFor(m).flat()
  const run = quickRun(m, cur, queueBefore)
  transact(() => ids.forEach((id) => patch(id, m === 'sort' ? { quadrant: value as Quadrant | null } : { slot: value })))

  // Back to where you left off if you wandered, else the next thought in the queue (not one just filed).
  const { resume, trail } = get().decks[m]
  const waiting = queueBefore.filter((i) => i.id === cur.id || !filing.has(i.id))
  let next =
    run ? nextInRun(run, cur.id)
    : resume && !filing.has(resume) && groupsFor(m)[0].some((i) => i.id === resume) ? resume
    : nextInQueue(waiting, cur.id)
  if (!next && !run && !queueBefore.some((i) => i.id === cur.id)) {
    // Nothing queued and you were browsing filed thoughts: stay at the same place in the list.
    const i = orderBefore.findIndex((it) => it.id === cur.id)
    next = [...orderBefore.slice(i + 1), ...orderBefore.slice(0, i).reverse()].find((it) => !filing.has(it.id))?.id ?? null
  }
  if (ids.length > 1) toast(`Filed${pickedNote(ids.length)}`, 'mod+z')
  set({ picked: null })

  setDeck(m, { cursor: next, resume: null, trail: [...trail.filter((id) => !filing.has(id)), ...ids].slice(-100) })
  const lands = value !== null && (m === 'sort' || columnFor(value, todayKey()) !== null)
  set((s) => ({
    trayExit: exitToward(m, value),
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
  set((s) => ({ landed: lands ? { id, n: (s.landed?.n ?? 0) + 1 } : s.landed }))
}

/** Shift+arrows in Sort: slide the selected thought to the neighbouring lane. ⌘↑ takes it back to unsorted. */
export function sortShift(dRow: number, dCol: number) {
  const cur = sortCurrent()
  if (!cur) return nothingHere('sort')
  // Each picked thought slides from wherever it is; the ones that can't move stay.
  const moves = targetIds(cur.id).flatMap((id) => {
    const it = findItem(id)
    const next = it ? shiftedQuadrant(it, dRow, dCol) : undefined
    return it && next !== undefined && next !== it.quadrant ? [{ id, next }] : []
  })
  if (!moves.length) return
  transact(() => moves.forEach((m) => patch(m.id, { quadrant: m.next })))
  landHere('sort', cur.id, moves.some((m) => m.next !== null))
}

/** Where a thought lands when slid a step in Sort; undefined if it can't go that way. */
function shiftedQuadrant(it: Item, dRow: number, dCol: number): Quadrant | null | undefined {
  if (!it.quadrant) {
    // Unsorted sits above the lanes: down or left enters Do, right enters Admin.
    if (dRow < 0) return undefined
    return dCol > 0 ? 'admin' : 'do'
  }
  if (dRow < 0) return null
  const at = QUADRANTS.findIndex((q) => q.id === it.quadrant)
  return QUADRANTS[clamp(at + dCol, 0, QUADRANTS.length - 1)].id
}

/** Shift+←/→ in Plan: a day earlier or later. Left of today unplans; right of Later stays in Later. */
export function planShift(dir: -1 | 1) {
  const cur = planCurrent()
  if (!cur) return nothingHere('plan')
  const today = todayKey()
  const keys = planColumns(today).map((c) => c.key)
  const moves = targetIds(cur.id).flatMap((id) => {
    const it = findItem(id)
    const col = it ? columnFor(it.slot, today) : null
    const i = col === null ? (dir > 0 ? 0 : -1) : keys.indexOf(col) + dir
    const next = i < 0 ? null : keys[Math.min(i, keys.length - 1)]
    return it && next !== col ? [{ id, next }] : []
  })
  if (!moves.length) return
  transact(() => moves.forEach((m) => patch(m.id, { slot: m.next })))
  landHere('plan', cur.id, moves.some((m) => m.next !== null))
}

export function deckFocus(m: DeckMode, id: string) {
  wander(m, id, { x: 0, y: -1 })
}

/**
 * Runs `change`, which takes the selected thought out of the deck (done or deleted), then lands on
 * what comes next: back where you left off if you wandered, else the next waiting thought, else
 * its neighbour in the list.
 */
function leaveDeck(m: DeckMode, cur: Item, change: () => void) {
  const queueBefore = groupsFor(m)[0]
  const orderBefore = groupsFor(m).flat()
  const run = quickRun(m, cur, queueBefore)
  change()
  const { resume } = get().decks[m]
  let next: string | null
  if (run) next = nextInRun(run, cur.id)
  else if (resume && resume !== cur.id && groupsFor(m)[0].some((i) => i.id === resume)) next = resume
  else if (queueBefore.some((i) => i.id === cur.id)) next = nextInQueue(queueBefore, cur.id)
  else {
    const i = orderBefore.findIndex((it) => it.id === cur.id)
    next = (orderBefore[i + 1] ?? orderBefore[i - 1])?.id ?? null
  }
  setDeck(m, { cursor: next, resume: null })
  set({ trayExit: { x: 0, y: -1 }, picked: null })
}

// ---------------------------------------------------------------- the same keys on every screen
//
// ⌘K ticks the selected thing off (and reopens it in the Archive), ⌘⌫ deletes it. Each screen has
// its own idea of "selected", so these look it up and hand over to the screen's own action.

export function completeCurrent() {
  const { mode } = get()
  if (mode === 'dump') return dumpToggleDone()
  if (mode === 'today') return todayToggle()
  if (mode === 'archive') return archiveReopen()
  const cur = trayCurrent()
  if (!cur) return nothingHere(mode)
  const ids = targetIds(cur.id)
  leaveDeck(mode, cur, () => transact(() => ids.forEach((id) => toggleDone(id))))
  if (ids.length > 1) toast(`Done. Archived${pickedNote(ids.length)}`, 'mod+z')
}

export function deleteCurrent() {
  const { mode } = get()
  if (mode === 'dump') return dumpDelete()
  if (mode === 'today') return todayDelete()
  if (mode === 'archive') return archiveDelete()
  const cur = trayCurrent()
  if (!cur) return nothingHere(mode)
  const ids = targetIds(cur.id)
  leaveDeck(mode, cur, () => transact(() => ids.forEach((id) => removeItem(id))))
  toast(ids.length > 1 ? `Deleted${pickedNote(ids.length)}` : `Deleted "${truncate(cur.text)}"`, 'mod+z')
}

// ---------------------------------------------------------------- order by hand
//
// Sort, Plan and Today list each group quickest first. ⌥↑ / ⌥↓ moves the selected thought up or
// down its list instead. That places every thought in the list by hand (the rest keep the order
// they were showing), and anything added later joins the end, sorted automatically.

export function orderMove(dir: -1 | 1) {
  const { mode, items } = get()
  if (mode === 'dump') return dumpMove(dir)
  if (mode !== 'sort' && mode !== 'plan' && mode !== 'today') return
  const cur = mode === 'today' ? todayCurrent() : trayCurrent()
  if (!cur) return toast('Nothing selected')
  const list = listOf(items, mode, cur.id, todayKey())
  if (!list) return toast('Unsorted thoughts are in Dump order. ⇧↑ ⇧↓ in Dump moves them')
  const i = list.findIndex((it) => it.id === cur.id)
  const j = i + dir
  if (j < 0 || j >= list.length) return
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  const place = new Map(next.map((it, n) => [it.id, n + 1]))
  commit(items.map((it) => (place.has(it.id) ? { ...it, manual: { ...it.manual, [mode]: place.get(it.id) } } : it)))
}

/** Back to the automatic order (quickest first) everywhere. */
export function orderAuto() {
  const { items } = get()
  if (!items.some((i) => i.manual)) return toast('Already in the automatic order')
  commit(items.map((i) => (i.manual ? { ...i, manual: undefined } : i)))
  toast('Back to quickest first, everywhere', 'mod+z')
}

// ---------------------------------------------------------------- time estimates

/** The thought the selected screen is showing: the tray card in Sort and Plan, the highlighted row in Today. */
function estimateTarget(): Item | null {
  const { mode } = get()
  if (mode === 'dump') return findItem(get().selectedId) ?? null
  if (mode === 'sort') return sortCurrent()
  if (mode === 'plan') return planCurrent()
  if (mode === 'today') return todayCurrent()
  return null
}

function noTarget() {
  toast(get().mode === 'dump' ? 'Select a thought first' : 'Nothing selected')
}

/** What the time keys change: the picked thoughts (else the selected one), a parent standing for its open subtasks. */
function timeTargets(cursor: string): string[] {
  const { items } = get()
  const ids = covering(targetIds(cursor)).flatMap((id) => {
    const kids = childrenOf(items, id).filter((k) => !k.done)
    return kids.length ? kids.map((k) => k.id) : [id]
  })
  return [...new Set(ids)]
}

/** ⌥1–⌥6: set how long it takes. The thought stays where it is. */
export function estimateSet(minutes: number | null) {
  const cur = estimateTarget()
  if (!cur) return noTarget()
  transact(() => timeTargets(cur.id).forEach((id) => patch(id, { minutes })))
}

export const estimatePreset = (n: number) => estimateSet(PRESETS[n - 1] ?? null)

/** = / -: a step longer or shorter. */
export function estimateStep(dir: 1 | -1) {
  const cur = estimateTarget()
  if (!cur) return noTarget()
  // Each one steps from its own estimate.
  transact(() => timeTargets(cur.id).forEach((id) => patch(id, { minutes: stepMinutes(findItem(id)?.minutes ?? null, dir) })))
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
  set({ todayCursor: list[clamp(i + dir, 0, list.length - 1)].id, picked: null })
}

/** The task to land on once `gone` leave Today's list: the next one down (wrapping if asked), else the one above. */
function todayAfter(list: Item[], curId: string, gone: Set<string>, wrap = false): string | null {
  const i = list.findIndex((it) => it.id === curId)
  const after = [...list.slice(i + 1), ...(wrap ? list.slice(0, i) : [])]
  return (after.find((it) => !gone.has(it.id)) ?? list.slice(0, i).reverse().find((it) => !gone.has(it.id)))?.id ?? null
}

/** ⌘K: tick it off, which sends it to the Archive, and move to the next task. */
export function todayToggle() {
  const cur = todayCurrent()
  if (!cur) return nothingToday()
  const list = todayList(get().items, todayKey())
  const ids = targetIds(cur.id)
  const next = todayAfter(list, cur.id, new Set(ids), true)
  rememberTimeLeft(ids)
  transact(() => ids.forEach((id) => patch(id, { done: true })))
  set({ todayCursor: next, picked: null })
  toast(next ? `Done. Archived${pickedNote(ids.length)}. Next up` : "Done. That's everything for today", 'mod+z')
  sessionSync() // a running session moves straight on to the next task
}

/** ⌘⌫: delete the selected task and move to the next one. */
export function todayDelete() {
  const cur = todayCurrent()
  if (!cur) return nothingToday()
  const list = todayList(get().items, todayKey())
  const ids = targetIds(cur.id)
  const next = todayAfter(list, cur.id, new Set(ids))
  transact(() => ids.forEach((id) => removeItem(id)))
  set({ todayCursor: next, picked: null })
  toast(ids.length > 1 ? `Deleted${pickedNote(ids.length)}` : `Deleted "${truncate(cur.text)}"`, 'mod+z')
  sessionSync()
}

/** T: not today. Moves it to tomorrow without guilt (and without losing it). */
export function todayDefer() {
  const cur = todayCurrent()
  if (!cur) return nothingToday()
  const list = todayList(get().items, todayKey())
  const ids = targetIds(cur.id)
  const next = todayAfter(list, cur.id, new Set(ids))
  transact(() => ids.forEach((id) => patch(id, { slot: addDays(todayKey(), 1) })))
  set({ todayCursor: next, picked: null })
  toast(ids.length > 1 ? `${plural(ids.length, 'task')} moved to tomorrow` : `"${truncate(cur.text, 24)}" moved to tomorrow`, 'mod+z')
  sessionSync()
}

/**
 * ⌥M: make the selected task today's main thing, the one that would make the day count. There is
 * one per day, so it takes over from any other. Again on the main thing unmarks it.
 */
export function todayMain() {
  const cur = todayCurrent()
  if (!cur) return nothingToday()
  const today = todayKey()
  const on = cur.main !== today
  transact(() => {
    for (const i of get().items) if (i.main === today && i.id !== cur.id) patch(i.id, { main: undefined })
    patch(cur.id, { main: on ? today : undefined })
  })
  set({ picked: null })
  toast(on ? `Main thing today: "${truncate(cur.text, 24)}"` : 'No main thing today', 'mod+z')
}

// ---------------------------------------------------------------- add on Today
//
// N opens a line at the top of Today. Type a task and ↵ puts it in today's plan and opens the
// next line. To say what it is first, ↓ moves down into the options (lane, then time):
// ←/→ walk along a row, ↑/↓ change row, ↵ picks (again to clear), and ⇧↵ adds the task from
// anywhere. What you picked stays picked until the line closes.

/** The rows of options under the add line. */
export const ADD_OPTIONS = {
  quadrant: QUADRANTS.filter((q) => q.id !== 'quick').map((q) => q.id), // a 2-minute task needs no day, so no place in today
  minutes: PRESETS,
}
const ADD_ROWS = [ADD_OPTIONS.quadrant, ADD_OPTIONS.minutes] as const

export function todayAddOpen() {
  if (!get().todayAdd) set({ todayAdd: { quadrant: null, minutes: null, cursor: null } })
}

/** Picks a lane for what's being added; picking the same one again clears it. */
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
  set({ todayCursor: id, picked: null })
}

/** Clicking a task's box ticks it off, the same as ⌘K on it. */
export function todayTick(id: string) {
  set({ todayCursor: id, picked: null })
  todayToggle()
}

// ---------------------------------------------------------------- work sessions
//
// Today's tasks can be split into sessions (⇧← / ⇧→ moves the selected task between them). F starts
// the session the selected task is in: it walks through the open tasks, each for as long as its
// estimate, and the clock runs down from the total. Nothing is ticked off for you. When the last
// window closes, what's still open is yours to finish, give more time, and carry on with.

/**
 * What a session is called: the name you gave it, else "Session 2". Sessions keep their number all
 * day, so the second one stays the second once the first is done.
 */
export const sessionName = (session: number, day = todayKey()) => get().sessionNames[day]?.[session] || `Session ${session}`

/** ⌥R on Today: name the session the selected task is in. */
export function sessionRenameOpen() {
  const cur = todayCurrent()
  if (!cur) return nothingToday()
  set({ sessionRename: { day: todayKey(), session: cur.session } })
}

/** Clicking a session's name on Today. */
export function sessionRenameAt(day: string, session: number) {
  set({ sessionRename: { day, session } })
}

/** ↵ (or clicking away) on the name: keep it. An empty name goes back to "Session 2". */
export function sessionRenameSave(value: string) {
  const at = get().sessionRename
  if (!at) return
  const name = value.trim()
  const today = todayKey()
  // Names only matter from today on; older days' are dropped as you go.
  const kept = Object.fromEntries(Object.entries(get().sessionNames).filter(([day]) => day >= today))
  const day = { ...kept[at.day] }
  if (name) day[at.session] = name
  else delete day[at.session]
  set({ sessionNames: { ...kept, [at.day]: day }, sessionRename: null })
}

export const sessionRenameCancel = () => set({ sessionRename: null })

const openIds = (session: number) => new Set(openInSession(get().items, todayKey(), session).map((i) => i.id))

const totalMinutes = (tasks: Item[]) => tasks.reduce((n, t) => n + effMinutes(t), 0)

/** ⌥F: start the selected task's session, stop the one running, or carry on once time's up. */
export function sessionToggle() {
  const { run } = get()
  if (run?.phase === 'over') return sessionCarryOn()
  if (run) return sessionStop()
  sessionStart()
}

/** ↵: start the selected task's session, or carry on after time's up. Never stops one. */
export function sessionStart() {
  const { run } = get()
  if (run?.pause) return pauseEnd()
  if (run) return run.phase === 'over' ? sessionCarryOn() : undefined
  const cur = todayCurrent()
  if (!cur) return nothingToday()
  const tasks = openInSession(get().items, todayKey(), cur.session)
  const started = startRun(cur.session, tasks, Date.now())
  if (!started) return toast('Everything in this session is done')
  set({ run: started, todayCursor: tasks[0].id })
  askForNotifications()
  toast(`${sessionName(cur.session)}: ${fmt(totalMinutes(tasks))} to work through`, 'alt+f')
  // Once per visit is enough: it won't change between sessions.
  if (notificationsBlocked() && !warnedBlocked) {
    warnedBlocked = true
    toast('Notifications are blocked here, so time-ups only show in this tab')
  }
}

let warnedBlocked = false

export function sessionStop() {
  if (!get().run) return toast('No session running')
  set({ run: null, pausing: false })
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
  if (run.pause) return pauseTick(run)
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

// ---------------------------------------------------------------- sent to Things
//
// Sending a session to Things hands over the only copy, so nothing leaves Composure until you say
// the tasks arrived (⌥↵). Then they are removed, and ⌘Z brings them back.

/** Notes the tasks that were opened in Things, to be cleared once you confirm. */
export function outboxSet(ids: string[], parts: number) {
  set({ outbox: { ids, sent: 1, parts } })
}

export function outboxSentPart() {
  const { outbox } = get()
  if (outbox) set({ outbox: { ...outbox, sent: outbox.sent + 1 } })
}

/** ⌥↵: the tasks arrived in Things, so they can go from here. */
export function outboxConfirm() {
  const { outbox, items } = get()
  if (!outbox) return
  const sent = new Set(outbox.ids)
  const gone = items.filter((i) => sent.has(i.id))
  // A parent left with none of its subtasks is only a label for tasks that are no longer here.
  const left = items.filter((i) => !sent.has(i.id))
  const orphans = new Set(gone.map((i) => i.parentId).filter((p): p is string => Boolean(p) && !left.some((i) => i.parentId === p)))
  commit(left.filter((i) => !orphans.has(i.id)))
  set({ outbox: null, picked: null })
  sessionSync()
  toast(`${plural(gone.length, 'task')} cleared. They're in Things now`, 'mod+z')
}

/** The tasks didn't arrive after all (or you changed your mind): keep them here, unsent. */
export function outboxCancel() {
  if (!get().outbox) return
  set({ outbox: null })
  toast('Kept here. Not sent to Things yet')
}

// ---------------------------------------------------------------- interruptions
//
// I (while a session runs) asks what came up. 1–4 start a bathroom break, a break, a call or a
// chore at once; or type it ("hang laundry 15m"). The task's clock stops until you're back (↵ or
// I again), and everything after slides later by the time you were away. When a timed one runs
// out you're told, but it waits for you: it doesn't quietly start burning the task's time.

/** I: ask what came up (or, if you're away, say you're back). */
export function pauseOpen() {
  const { run, pausing } = get()
  if (!run || run.phase !== 'running') return toast('Start a session first', 'alt+f')
  if (run.pause) return pauseEnd()
  set({ pausing: !pausing })
}

export const pauseClose = () => set({ pausing: false })

/** Starts being away now. */
export function pauseBegin(label: string, minutes: number | null) {
  const { run } = get()
  set({ pausing: false })
  if (!run || run.phase !== 'running' || run.pause) return
  set({ run: { ...run, pause: { label, minutes, startedAt: Date.now() } } })
  toast(`${label}${minutes ? ` · ${fmt(minutes)}` : ''}. Clock paused`, 'alt+p')
}

/** 1–4 on the line. */
export function pausePreset(n: number) {
  const p = PAUSE_PRESETS[n - 1]
  if (p) pauseBegin(p.label, p.minutes)
}

/** ↵ on the typed line: "call mum 15m". */
export function pauseSubmit(text: string) {
  if (!text.trim()) return pauseClose()
  const { label, minutes } = parsePause(text)
  pauseBegin(label, minutes)
}

/** Back to the task: its window slides later by as long as you were away. */
export function pauseEnd() {
  const { run } = get()
  if (!run?.pause) return
  const away = Date.now() - run.pause.startedAt
  set({ run: endPause(run, Date.now()) })
  toast(`Back. ${run.pause.label} took ${fmt(Math.max(1, Math.round(away / 60_000)))}`)
}

/** How much of its window a task had left when it was ticked off mid-session, so ⌘Z can hand it back. */
const leftOnTick = new Map<string, number>()

function rememberTimeLeft(ids: string[]) {
  const { run, items } = get()
  const active = run && activeId(run)
  const win = run && windowOf(run, items)
  if (!run || !active || !win || !ids.includes(active)) return
  leftOnTick.set(active, Math.max(0, win.start + win.ms - taskClock(run, Date.now())))
}

/**
 * After ⌘Z: a task the session had already passed is open again (ticked off by mistake). The session
 * goes back to it with the time it had left, rather than leaving it behind marked "over time".
 */
function sessionReopen(before: Item[]) {
  const { run, items } = get()
  if (!run || run.phase !== 'running' || run.pause) return
  const today = todayKey()
  const openBefore = new Set(openInSession(before, today, run.session).map((i) => i.id))
  const openNow = new Set(openInSession(items, today, run.session).map((i) => i.id))
  const back = run.queue.findIndex((id, k) => k < run.index && openNow.has(id) && !openBefore.has(id))
  if (back === -1) return
  const id = run.queue[back]
  const full = effMinutes(items.find((i) => i.id === id)!) * 60_000
  const left = Math.min(full, leftOnTick.get(id) ?? full)
  set({ run: { ...run, index: back, startedAt: Date.now() - (full - left) }, todayCursor: id })
}

/** While away: tell you once when a timed pause runs out. The task's clock stays held. */
function pauseTick(run: NonNullable<State['run']>) {
  const { pause } = run
  if (!pause || pause.over || pause.minutes === null || pauseLeftMs(pause, Date.now()) > 0) return
  set({ run: { ...run, pause: { ...pause, over: true } } })
  const task = get().items.find((i) => i.id === activeId(run))?.text ?? ''
  notify(`${pause.label} is up`, task ? `Back to: ${truncate(task, 40)}` : undefined)
  toast(`${pause.label} is up. ↵ when you're back`, 'enter')
}

/** 1–9 on Today: move the selected task (or the picked ones) to that session. One past the last starts a new one. */
export function todayToSession(n: number) {
  const cur = todayCurrent()
  if (!cur) return nothingToday()
  const last = Math.max(0, ...todaySessions(get().items, todayKey()).map((g) => g.session))
  if (n > last + 1) return toast(`${sessionName(last + 1)} starts a new one`, String(last + 1))
  const ids = targetIds(cur.id)
  transact(() => ids.forEach((id) => patch(id, { session: n })))
  set({ todayCursor: cur.id }) // the selection (and what's picked) stays on what you moved
  sessionSync()
}

/** ⇧← / ⇧→: move the selected task to the previous or next session. Past the last one starts a new session. */
export function todayMoveSession(dir: -1 | 1) {
  const cur = todayCurrent()
  if (!cur) return nothingToday()
  const groups = todaySessions(get().items, todayKey())
  const picked = new Set(targetIds(cur.id))
  // Each picked task goes to its neighbouring session; past the last one starts a new session
  // (unless the picked tasks are all that session has, which would only rename it).
  const moves = groups.flatMap((here, at) => {
    const mine = here.items.filter((it) => picked.has(it.id))
    if (!mine.length) return []
    const session =
      dir < 0 ? groups[at - 1]?.session : (groups[at + 1]?.session ?? (mine.length < here.items.length ? here.session + 1 : undefined))
    return session === undefined ? [] : mine.map((it) => ({ id: it.id, session }))
  })
  if (!moves.length) return
  transact(() => moves.forEach((m) => patch(m.id, { session: m.session })))
  set({ todayCursor: cur.id }) // the selection (and what's picked) stays on what you moved
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

// ---------------------------------------------------------------- the thought sheet
//
// ↵ or ⌘E opens everything about the selected thought (or the picked ones) in one place: its text,
// lane, day, time and session. ⌘S opens it on the day, → in Dump on the first thing missing,
// and clicking a tag opens it on that tag's row. The numbers on each row pick (the same ones Sort
// and Plan use), picks apply at once, and ⌘Z undoes them.

let sheetNonce = 0
/** Dump's list when the sheet opened, so closing it can land beside a thought that left the list. */
let dumpOrderAtOpen: Item[] = []

/** The thoughts the keys act on: the picked ones, else the one selected on this screen. */
function subjectIds(): string[] {
  const { mode, selectedId } = get()
  const cur =
    mode === 'dump' ? findItem(selectedId) : mode === 'today' ? todayCurrent() : mode === 'archive' ? archiveCurrent() : trayCurrent()
  return cur ? targetIds(cur.id) : []
}

/**
 * What a change to `field` lands on: each thought in the sheet, or a parent's open subtasks. When
 * filling in, only the ones that lack it (or all of them, if none does).
 */
export function sheetTargets(sheet: Sheet, field: Field): Item[] {
  const { items } = get()
  const out = new Map<string, Item>()
  for (const id of sheet.ids) {
    const item = items.find((i) => i.id === id)
    if (!item) continue
    const kids = childrenOf(items, id).filter((k) => !k.done)
    for (const t of kids.length ? kids : [item]) out.set(t.id, t)
  }
  const all = [...out.values()]
  if (sheet.purpose !== 'fill' || !(GAPS as Field[]).includes(field)) return all
  const lacking = all.filter((t) => gapsOf(t).includes(field as Gap))
  return lacking.length ? lacking : all
}

/** What the sheet's thoughts still lack, in the order it asks for them. */
function sheetNeeds(sheet: Sheet): Gap[] {
  const all = sheetTargets({ ...sheet, purpose: 'edit' }, 'quadrant')
  return GAPS.filter((g) => all.some((t) => gapsOf(t).includes(g)))
}

/** The one day all the sheet's thoughts are planned for (a late one counts as today), whose sessions it offers. */
export function sheetSessionDay(sheet: Sheet): string | null {
  const today = todayKey()
  const days = new Set(sheetTargets({ ...sheet, purpose: 'edit' }, 'session').map((t) => (isDateSlot(t.slot) ? (t.slot < today ? today : t.slot) : null)))
  const [day] = days
  return days.size === 1 && day ? day : null
}

/** A day's work sessions, in order, as Today and the sheet show them. */
export function sessionsOn(day: string): SessionChoice[] {
  const { items } = get()
  const today = todayKey()
  const list = day === today ? todayList(items, today) : leaves(live(items)).filter((i) => i.slot === day && isPlannable(i))
  return [...new Set(list.map((i) => i.session))].sort((a, b) => a - b).map((n) => ({ session: n, label: sessionName(n, day) }))
}

/** The rows the sheet shows. A finished thought only has its text; the session row needs a day. */
export function sheetRows(sheet: Sheet): Field[] {
  const archived = archivedIds(get().items)
  if (sheet.ids.every((id) => archived.has(id))) return ['text']
  const rows: Field[] = sheet.ids.length === 1 ? ['text'] : []
  rows.push('quadrant', 'slot', 'minutes')
  if (sheetSessionDay(sheet)) rows.push('session')
  return rows
}

/** The numbered options on one of the sheet's rows. */
export function sheetOptions(sheet: Sheet, row: Field): FieldOption[] {
  const day = row === 'session' ? sheetSessionDay(sheet) : null
  return fieldOptions(row, todayKey(), day ? sessionsOn(day) : [])
}

/** The value every one of the sheet's thoughts has on a row, or undefined when they differ. */
export function sheetValue<F extends Exclude<Field, 'text'>>(sheet: Sheet, row: F): Item[F] | undefined {
  const values = new Set(sheetTargets({ ...sheet, purpose: 'edit' }, row).map((t) => t[row]))
  return values.size === 1 ? [...values][0] : undefined
}

/** Whether an option is what the thoughts already have (a far-off day counts as Later). */
export function isCurrentOption(sheet: Sheet, row: Field, option: FieldOption): boolean {
  if (row === 'text') return false
  const value = sheetValue(sheet, row)
  if (value === undefined) return false
  if (row === 'slot') return columnFor(value as Slot | null, todayKey()) === option.change.slot
  return option.change[row] === value
}

/** Where the arrow keys start on a row: on what's already set, else the first option. */
function currentCol(sheet: Sheet, row: Field): number {
  return Math.max(0, sheetOptions(sheet, row).findIndex((o) => isCurrentOption(sheet, row, o)))
}

/** What the day row offers for what's typed on it, read the way people say days (lib/when.ts). */
export function sheetReadings(sheet: Sheet) {
  const value = sheetValue(sheet, 'slot')
  return whenOptions(sheet.query ?? '', todayKey(), value === undefined ? LATER : value)
}

/** Opens the sheet on these thoughts: on `row`, or where the purpose starts. */
export function sheetOpenFor(ids: string[], purpose: Sheet['purpose'], row?: Field, typing = false) {
  const found = ids.filter((id) => findItem(id))
  if (!found.length) return
  const draft: Sheet = { ids: found, purpose, row: 'text', col: 0, query: null, receipt: null, nonce: ++sheetNonce }
  const rows = sheetRows(draft)
  const first = row && rows.includes(row) ? row : purpose === 'fill' ? sheetNeeds(draft)[0] : rows[0]
  if (!first) return toast('Nothing missing. It has a lane, a day and a time')
  dumpOrderAtOpen = get().mode === 'dump' ? treeOrder(liveItems()) : []
  set({ sheet: { ...draft, row: first, col: currentCol(draft, first), query: typing && first === 'slot' ? '' : null } })
}

/** ↵ / ⌘E: everything about the selected thought (or the picked ones). ⌘S and → open it on a row. */
export function sheetOpen(purpose: Sheet['purpose'] = 'edit', row?: Field, typing = false) {
  const s = get()
  if (s.sheet) return
  if (s.todayAdd || s.editing?.kind === 'draft') return toast('Finish typing first')
  if (s.mode === 'archive' && row === 'slot') return toast('Reopen it first')
  const ids = subjectIds()
  if (!ids.length) return toast(s.mode === 'dump' ? 'Select a thought first' : 'Nothing selected')
  sheetOpenFor(ids, purpose, row, typing)
}

/** ⌘E (and ↵ on Sort, Plan, Today and the Archive): open the thought. */
export const editCurrent = () => sheetOpen('edit')
/** ⌘S: straight to the day, ready to type one. */
export const whenOpen = () => sheetOpen('field', 'slot', true)
/** → in Dump: ask for what the thought still lacks. */
export const fillOpen = () => sheetOpen('fill')

export function sheetClose() {
  const sh = get().sheet
  if (!sh) return
  set({ sheet: null })
  // A thought that now has a lane, a day and a time steps out of Dump: select its neighbour.
  if (get().mode === 'dump') landBeside(sh.ids[0], dumpOrderAtOpen)
}

/** ↑/↓: the row above or below. */
export function sheetRow(dir: -1 | 1) {
  const sh = get().sheet
  if (!sh) return
  const rows = sheetRows(sh)
  const row = rows[clamp(rows.indexOf(sh.row) + dir, 0, rows.length - 1)]
  if (row && row !== sh.row) set({ sheet: { ...sh, row, col: currentCol(sh, row), query: null } })
}

/** A click on a row's label. */
export function sheetGo(row: Field) {
  const sh = get().sheet
  if (sh && row !== sh.row) set({ sheet: { ...sh, row, col: currentCol(sh, row), query: null } })
}

/** ←/→: along the row's options (or the readings of a typed day). */
export function sheetCol(dir: -1 | 1) {
  const sh = get().sheet
  if (!sh || sh.row === 'text') return
  const n = sh.query !== null ? sheetReadings(sh).length : sheetOptions(sh, sh.row).length
  set({ sheet: { ...sh, col: clamp(sh.col + dir, 0, Math.max(0, n - 1)) } })
}

/** Typing on the day row: a phrase to read ("next fri"), or null to go back to the numbers. */
export function sheetType(query: string | null) {
  const sh = get().sheet
  if (sh) set({ sheet: { ...sh, row: 'slot', query, col: 0 } })
}

/** 1–9 (0 clears): pick that option on the row, at once, for everything in the sheet. */
export function sheetPick(n: number) {
  const sh = get().sheet
  if (!sh || sh.row === 'text' || sh.query !== null) return
  if (n === 0) {
    const cleared = CLEARED[sh.row]
    if (cleared) sheetApply(sh.row, cleared.change, cleared.label)
    return
  }
  const option = sheetOptions(sh, sh.row).find((o) => o.n === n)
  if (option) sheetApply(sh.row, option.change, option.label)
}

/** ↵: the highlighted option, or the highlighted reading of a typed day. */
export function sheetEnter() {
  const sh = get().sheet
  if (!sh || sh.row === 'text') return
  if (sh.query !== null) {
    const reading = sheetReadings(sh)[sh.col]
    if (reading) sheetApply('slot', { slot: reading.slot }, reading.label)
    return
  }
  const option = sheetOptions(sh, sh.row)[sh.col]
  if (option) sheetApply(sh.row, option.change, option.label)
}

/** ⌥1–⌥6 on the sheet: that time, whichever row you're on. */
export function sheetTime(n: number) {
  const sh = get().sheet
  const option = sh && sheetOptions(sh, 'minutes').find((o) => o.n === n)
  if (sh && option) sheetApply('minutes', option.change, option.label)
}

/** A click on an option: the same as its number. */
export function sheetChoose(row: Field, option: FieldOption) {
  const sh = get().sheet
  if (sh) sheetApply(row, option.change, option.label)
}

/** Applies a change to everything in the sheet, then does what the sheet was opened for. */
function sheetApply(field: Field, change: Partial<Item>, label: string) {
  const sh = get().sheet
  if (!sh) return
  const targets = sheetTargets(sh, field)
  if (!targets.length) return
  const { mode } = get()
  const today = todayKey()
  const todayBefore = mode === 'today' ? todayList(get().items, today) : []
  const cursorBefore = mode === 'today' ? todayCurrent()?.id : undefined

  // In Plan, giving the card on the tray a day files it the way 1–8 do, so ⌫ brings it back.
  if (mode === 'plan' && field === 'slot' && sh.purpose === 'field' && sh.ids.length === 1 && sh.ids[0] === planCurrent()?.id) {
    deckFile('plan', change.slot ?? null)
  } else {
    transact(() => targets.forEach((t) => patch(t.id, change)))
  }

  // A task given another day (or session) moves out from under the cursor: land on the next one.
  if (mode === 'today' && cursorBefore) {
    const still = new Set(todayList(get().items, today).map((i) => i.id))
    const gone = new Set(targets.map((t) => t.id).filter((id) => !still.has(id)))
    if (gone.has(cursorBefore)) set({ todayCursor: todayAfter(todayBefore, cursorBefore, gone) })
    sessionSync()
  }

  const many = targets.length > 1 ? `${plural(targets.length, 'thought')}: ` : ''
  const receipt = `${many}${FIELD_LABEL[field]} → ${label}`
  // Once the sheet closes its receipt goes with it, so a toast says what happened instead.
  const subject = findItem(sh.ids[0])
  const said = sh.ids.length > 1 || !subject ? receipt : `"${truncate(subject.text, 24)}" → ${label}`
  if (sh.purpose === 'field') {
    // One quick change, like a filing key: the picking is done with.
    set({ picked: null })
    sheetClose()
    return toast(said, 'mod+z')
  }
  if (sh.purpose === 'fill') {
    const needs = sheetNeeds(sh)
    if (!needs.length) {
      sheetClose()
      return toast(said, 'mod+z')
    }
    // On to the next thing missing, else back to one skipped over.
    const next = needs.find((g) => GAPS.indexOf(g) > GAPS.indexOf(field as Gap)) ?? needs[0]
    return set({ sheet: { ...sh, row: next, col: currentCol(sh, next), query: null, receipt } })
  }
  set({ sheet: { ...sh, query: null, col: field === 'text' ? 0 : currentCol(sh, field), receipt } })
}

/** The sheet's text box: saves on ↵ and on leaving it. An empty box keeps the old text. */
export function sheetSetText(value: string) {
  const sh = get().sheet
  const text = value.trim()
  if (!sh || sh.ids.length !== 1 || !text) return
  const item = findItem(sh.ids[0])
  if (item && item.text !== text) updateText(item.id, text)
}

/** - / = in the sheet: a step shorter or longer, each thought from its own estimate. */
export function sheetNudge(dir: 1 | -1) {
  const sh = get().sheet
  if (!sh) return
  const targets = sheetTargets(sh, 'minutes')
  transact(() => targets.forEach((t) => patch(t.id, { minutes: stepMinutes(findItem(t.id)?.minutes ?? null, dir) })))
  const after = targets.length === 1 ? findItem(targets[0].id)?.minutes : undefined
  const label = targets.length > 1 ? (dir > 0 ? 'longer' : 'shorter') : after ? fmt(after) : 'no time'
  const next = get().sheet!
  set({ sheet: { ...next, row: 'minutes', query: null, col: currentCol(next, 'minutes'), receipt: `time → ${label}` } })
}

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id))

/** ⌘K in the sheet: tick off what it shows (reopen, in the Archive), and close. */
export function sheetDone() {
  const sh = get().sheet
  if (!sh) return
  set({ sheet: null })
  if (sameIds(sh.ids, subjectIds())) return completeCurrent()
  transact(() => sh.ids.forEach((id) => toggleDone(id)))
}

/** ⌘⌫ in the sheet: delete what it shows, and close. */
export function sheetDelete() {
  const sh = get().sheet
  if (!sh) return
  set({ sheet: null })
  if (sameIds(sh.ids, subjectIds())) return deleteCurrent()
  transact(() => sh.ids.forEach((id) => removeItem(id)))
  toast(sh.ids.length > 1 ? `Deleted ${plural(sh.ids.length, 'thought')}` : 'Deleted', 'mod+z')
}

// ---------------------------------------------------------------- navigation

/** A thought picked in search: selected where it is on this screen, else opened right here. */
export function jumpTo(id: string) {
  const { mode } = get()
  if (isDeck(mode) && inDeck(mode, id)) return deckFocus(mode, id)
  if (mode === 'today' && todayList(get().items, todayKey()).some((i) => i.id === id)) return todayFocus(id)
  if (mode === 'dump' && liveItems().some((i) => i.id === id)) return set({ selectedId: id })
  if (archivedIds(get().items).has(id)) {
    setMode('archive')
    return archiveFocus(id)
  }
  // Somewhere else (another day, tucked away in Dump): open it here rather than switching screens.
  sheetOpenFor([id], 'edit')
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

/** Help's two pages: how it works, and every key. */
export function helpTab(tab: 'guide' | 'keys') {
  set({ helpTab: tab })
}

export function cycleTheme() {
  const order = ['system', 'dark', 'light'] as const
  const next = order[(order.indexOf(get().theme) + 1) % order.length]
  set({ theme: next })
  toast(`Theme: ${next}`)
}

/** Full app or sessions only. Turning sessions on lands on Today; nothing is deleted either way. */
export function toggleWorkMode() {
  const workMode = get().workMode === 'full' ? 'sessions' : 'full'
  set(workMode === 'sessions' ? { workMode, mode: 'today' } : { workMode })
  resetCursors()
  toast(workMode === 'sessions' ? 'Sessions mode: just Today' : 'Full app: Dump, Sort, Plan and Archive are back')
}

export function toggleHud() {
  const hud = !get().hud
  set({ hud })
  toast(hud ? 'Keystroke overlay on' : 'Keystroke overlay off')
}
