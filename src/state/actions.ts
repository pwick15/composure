import { columnFor, planColumns, todayKey } from '../lib/dates'
import { uid } from '../lib/id'
import { QUADRANT_BY_ID, quadrantAt } from '../lib/quadrants'
import {
  nextInQueue,
  nextUnsorted,
  planOrder,
  planQueue,
  resolvePlanCursor,
  resolveSortCursor,
  sortOrder,
} from '../lib/selectors'
import type { Item, Mode, Quadrant, Slot } from '../lib/types'
import { type Editing, getState as get, setState as set } from './store'

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

export function undo() {
  const s = get()
  const prev = s.past.at(-1)
  if (!prev) return toast('Nothing to undo')
  set({
    items: prev,
    past: s.past.slice(0, -1),
    future: [s.items, ...s.future],
    sortPending: null,
    planPending: null,
    editing: null,
  })
}

export function redo() {
  const s = get()
  const next = s.future[0]
  if (!next) return toast('Nothing to redo')
  set({ items: next, past: [...s.past, s.items], future: s.future.slice(1), sortPending: null, planPending: null })
}

// ---------------------------------------------------------------- toasts

let toastSeq = 0

export function toast(text: string, keys?: string) {
  const id = ++toastSeq
  set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, keys }] }))
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3200)
}

// ---------------------------------------------------------------- items

export function makeItem(text: string): Item {
  return { id: uid(), text, createdAt: Date.now(), quadrant: null, slot: null, done: false }
}

const findItem = (id: string | null) => (id ? get().items.find((i) => i.id === id) : undefined)

function neighbours(id: string) {
  const { items } = get()
  const i = items.findIndex((it) => it.id === id)
  return { prev: items[i - 1]?.id ?? null, next: items[i + 1]?.id ?? null }
}

function patch(id: string, change: Partial<Item>) {
  const item = findItem(id)
  if (!item) return
  const same = (Object.keys(change) as (keyof Item)[]).every((k) => item[k] === change[k])
  if (same) return
  commit(get().items.map((i) => (i.id === id ? { ...i, ...change } : i)))
}

/** Inserts after `afterId`; null inserts at the top. Returns the new ids. */
export function addItems(afterId: string | null, texts: string[]): string[] {
  if (!texts.length) return []
  const { items } = get()
  const created = texts.map(makeItem)
  const found = afterId === null ? -1 : items.findIndex((i) => i.id === afterId)
  const at = afterId === null ? 0 : found === -1 ? items.length : found + 1
  commit([...items.slice(0, at), ...created, ...items.slice(at)])
  return created.map((i) => i.id)
}

export const updateText = (id: string, text: string) => patch(id, { text })
export const removeItem = (id: string) => commit(get().items.filter((i) => i.id !== id))

export function toggleDone(id: string) {
  const item = findItem(id)
  if (!item) return
  patch(id, { done: !item.done })
  toast(item.done ? 'Marked not done' : 'Done', 'x')
}

export function moveItem(id: string, dir: -1 | 1) {
  const items = [...get().items]
  const i = items.findIndex((it) => it.id === id)
  const j = i + dir
  if (i === -1 || j < 0 || j >= items.length) return
  ;[items[i], items[j]] = [items[j], items[i]]
  commit(items)
}

export function replaceItems(items: Item[]) {
  commit(items)
  resetCursors()
}

export function clearDone() {
  const { items } = get()
  const n = items.filter((i) => i.done).length
  if (!n) return toast('No completed items')
  commit(items.filter((i) => !i.done))
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
  const anchor = s.mode === 'dump' ? (s.selectedId ?? s.items.at(-1)?.id ?? null) : (s.items.at(-1)?.id ?? null)
  const ids = addItems(anchor, lines)
  if (s.mode === 'dump') set({ selectedId: ids.at(-1) ?? null })
  toast(`Added ${ids.length} item${ids.length === 1 ? '' : 's'}`, 'mod+z')
}

function resetCursors() {
  set({
    selectedId: null,
    editing: null,
    sortCursor: null,
    sortPending: null,
    planCursor: null,
    planPending: null,
    trayEditing: null,
    landed: null,
  })
}

// ---------------------------------------------------------------- modes

const MODES: Mode[] = ['dump', 'sort', 'plan']

export function setMode(mode: Mode) {
  if (get().mode === mode) return
  set({ mode })
  resetCursors()
}

export function cycleMode(dir: -1 | 1) {
  const i = MODES.indexOf(get().mode)
  setMode(MODES[(i + dir + MODES.length) % MODES.length])
}

// ---------------------------------------------------------------- dump

let draftNonce = 0
const draftAfter = (afterId: string | null, seed = ''): EditTarget => ({
  kind: 'draft',
  afterId,
  seed,
  nonce: ++draftNonce,
})

export function startDraft(seed = '') {
  const s = get()
  const afterId = s.selectedId ?? s.items.at(-1)?.id ?? null
  set({ editing: draftAfter(afterId, seed) })
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
  if (target.kind === 'draft') return text ? addItems(target.afterId, [text])[0] : null
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
  if (id) set({ editing: draftAfter(id), selectedId: id })
  else set({ editing: null, selectedId: fallback })
}

export function editorExit(target: EditTarget, value: string) {
  if (!isEditing(target)) return
  const fallback = fallbackSelection(target)
  const id = commitEditor(target, value)
  set({ editing: null, selectedId: id ?? fallback })
}

export function editorBackspaceEmpty(target: EditTarget) {
  if (target.kind === 'draft') {
    const prev = target.afterId
    set({ editing: prev ? { kind: 'item', id: prev, caret: 'end' } : null, selectedId: prev })
    return
  }
  const { prev, next } = neighbours(target.id)
  removeItem(target.id)
  set({ editing: prev ? { kind: 'item', id: prev, caret: 'end' } : null, selectedId: prev ?? next })
}

export function editorMove(target: EditTarget, value: string, dir: -1 | 1) {
  const { items } = get()
  let prev: string | null
  let next: string | null
  if (target.kind === 'draft') {
    prev = target.afterId
    const at = target.afterId === null ? 0 : items.findIndex((i) => i.id === target.afterId) + 1
    next = items[at]?.id ?? null
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
    if (id) set({ editing: draftAfter(id), selectedId: id })
  }
}

export function editorPaste(target: EditTarget, merged: string, rest: string[]) {
  const fallback = fallbackSelection(target)
  const last = transact(() => {
    const id = commitEditor(target, merged)
    const anchor = id ?? fallback
    return addItems(anchor, rest).at(-1) ?? anchor
  })
  set({ editing: draftAfter(last), selectedId: last })
  toast(`Added ${rest.length + 1} items`, 'mod+z')
}

export function dumpEnter() {
  const { selectedId } = get()
  if (selectedId) startEdit(selectedId)
  else startDraft()
}

export function dumpSelect(dir: -1 | 1) {
  const { items, selectedId } = get()
  if (!items.length) return
  const i = items.findIndex((it) => it.id === selectedId)
  const next = i === -1 ? (dir > 0 ? 0 : items.length - 1) : clamp(i + dir, 0, items.length - 1)
  set({ selectedId: items[next].id })
}

export function dumpDelete() {
  const item = findItem(get().selectedId)
  if (!item) return
  const { prev, next } = neighbours(item.id)
  removeItem(item.id)
  set({ selectedId: next ?? prev })
  toast(`Deleted "${truncate(item.text)}"`, 'mod+z')
}

export function dumpMove(dir: -1 | 1) {
  const { selectedId } = get()
  if (selectedId) moveItem(selectedId, dir)
}

export function dumpToggleDone() {
  const { selectedId } = get()
  if (selectedId) toggleDone(selectedId)
}

export function dumpEscape() {
  set({ selectedId: null })
}

// ---------------------------------------------------------------- sort

export function sortCurrent(): Item | null {
  const s = get()
  return findItem(resolveSortCursor(s.items, s.sortCursor)) ?? null
}

function nothingHere(what: 'sort' | 'plan') {
  if (!get().items.length) return toast('Nothing here yet. Dump some thoughts first', 'shift+1')
  if (what === 'sort') return toast('Everything is sorted. J / K to revise', 'shift+3')
  toast('Everything is planned. J / K to revise')
}

export function sortPick(q: Quadrant | null) {
  if (!sortCurrent()) return nothingHere('sort')
  set({ sortPending: { value: q }, trayEditing: null })
}

export function sortNudge(dRow: number, dCol: number) {
  const cur = sortCurrent()
  if (!cur) return nothingHere('sort')
  const s = get()
  const base = s.sortPending ? s.sortPending.value : cur.quadrant
  if (!base) return set({ sortPending: { value: 'do' } })
  const m = QUADRANT_BY_ID[base]
  set({ sortPending: { value: quadrantAt(clamp(m.row + dRow, 0, 1), clamp(m.col + dCol, 0, 1)) } })
}

export function sortConfirm() {
  const cur = sortCurrent()
  if (!cur) return nothingHere('sort')
  const s = get()
  const pending = s.sortPending
  if (!pending && !cur.quadrant) {
    set({ shake: s.shake + 1 })
    return toast('Pick a quadrant first', 'q')
  }
  if (pending) patch(cur.id, { quadrant: pending.value })
  const target = pending ? pending.value : cur.quadrant
  const meta = target ? QUADRANT_BY_ID[target] : null
  set({
    sortCursor: nextUnsorted(get().items, cur.id),
    sortPending: null,
    trayEditing: null,
    trayExit: meta ? { x: meta.col === 0 ? -1 : 1, y: meta.row === 0 ? 1 : 2 } : { x: 0, y: -1 },
    landed: target ? { id: cur.id, n: (s.landed?.n ?? 0) + 1 } : s.landed,
  })
}

export function sortStep(dir: -1 | 1) {
  const s = get()
  const order = sortOrder(s.items)
  if (!order.length) return nothingHere('sort')
  const cur = resolveSortCursor(s.items, s.sortCursor)
  const i = order.findIndex((it) => it.id === cur)
  const next = i === -1 ? (dir > 0 ? 0 : order.length - 1) : (i + dir + order.length) % order.length
  set({ sortCursor: order[next].id, sortPending: null, trayEditing: null, trayExit: { x: -dir, y: 0 } })
}

export function sortCancel() {
  set({ sortPending: null })
}

export function sortFocus(id: string) {
  set({ sortCursor: id, sortPending: null, trayEditing: null, trayExit: { x: 0, y: -1 } })
}

export function sortAssign(q: Quadrant) {
  if (!sortCurrent()) return nothingHere('sort')
  set({ sortPending: { value: q } })
  sortConfirm()
}

// ---------------------------------------------------------------- plan

export function planCurrent(): Item | null {
  const s = get()
  return findItem(resolvePlanCursor(s.items, s.planCursor, todayKey())) ?? null
}

export function planPick(slot: Slot | null) {
  if (!planCurrent()) return nothingHere('plan')
  set({ planPending: { value: slot }, trayEditing: null })
}

export function planPickIndex(n: number) {
  const col = planColumns(todayKey())[n - 1]
  if (col) planPick(col.key)
}

export function planNudge(dir: -1 | 1) {
  const cur = planCurrent()
  if (!cur) return nothingHere('plan')
  const today = todayKey()
  const cols = planColumns(today).map((c) => c.key)
  const s = get()
  const base = s.planPending ? s.planPending.value : columnFor(cur.slot, today)
  if (base === null) return set({ planPending: { value: cols[0] } })
  const i = cols.indexOf(columnFor(base, today) ?? cols[0])
  set({ planPending: { value: cols[clamp(i + dir, 0, cols.length - 1)] } })
}

export function planConfirm() {
  const cur = planCurrent()
  if (!cur) return nothingHere('plan')
  const s = get()
  const today = todayKey()
  const pending = s.planPending
  if (!pending && columnFor(cur.slot, today) === null) {
    set({ shake: s.shake + 1 })
    return toast('Pick a day first', '1')
  }
  const queueBefore = planQueue(s.items, today)
  if (pending) patch(cur.id, { slot: pending.value })
  const target = pending ? pending.value : cur.slot
  const cols = planColumns(today)
  const col = target ? cols.findIndex((c) => c.key === columnFor(target, today)) : -1
  set({
    planCursor: nextInQueue(queueBefore, cur.id),
    planPending: null,
    trayEditing: null,
    trayExit: col >= 0 ? { x: (col - (cols.length - 1) / 2) / 2, y: 1.6 } : { x: 0, y: -1 },
    landed: col >= 0 ? { id: cur.id, n: (s.landed?.n ?? 0) + 1 } : s.landed,
  })
}

export function planStep(dir: -1 | 1) {
  const s = get()
  const today = todayKey()
  const order = planOrder(s.items, today)
  if (!order.length) return nothingHere('plan')
  const cur = resolvePlanCursor(s.items, s.planCursor, today)
  const i = order.findIndex((it) => it.id === cur)
  const next = i === -1 ? (dir > 0 ? 0 : order.length - 1) : (i + dir + order.length) % order.length
  set({ planCursor: order[next].id, planPending: null, trayEditing: null, trayExit: { x: -dir, y: 0 } })
}

export function planCancel() {
  set({ planPending: null })
}

export function planFocus(id: string) {
  set({ planCursor: id, planPending: null, trayEditing: null, trayExit: { x: 0, y: -1 } })
}

export function planAssign(slot: Slot) {
  if (!planCurrent()) return nothingHere('plan')
  set({ planPending: { value: slot } })
  planConfirm()
}

// ---------------------------------------------------------------- tray (sort + plan)

export const trayCurrent = () => (get().mode === 'plan' ? planCurrent() : sortCurrent())

export function trayEdit() {
  const cur = trayCurrent()
  if (cur) set({ trayEditing: cur.id, sortPending: null, planPending: null })
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

// ---------------------------------------------------------------- navigation

export function jumpTo(id: string) {
  const s = get()
  if (s.mode === 'sort') return sortFocus(id)
  if (s.mode === 'plan' && planOrder(s.items, todayKey()).some((i) => i.id === id)) return planFocus(id)
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
