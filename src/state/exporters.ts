import { todayKey } from '../lib/dates'
import { makeBackup, matrixMarkdown, mergeSessionNames, parseBackup, parseSessionNames, planICS, planMarkdown, sessionMarkdown, sessionTasks, thingsSessionLinks, thingsURL } from '../lib/export'
import { parseNotes } from '../lib/text'
import { importItems, makeItem, outboxSentPart, outboxSet, toast, todayCurrent } from './actions'
import { getState as get, setState as set } from './store'

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

function download(filename: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function copyPlan() {
  const ok = await copyText(planMarkdown(get().items, todayKey()))
  toast(ok ? 'Plan copied as Markdown' : 'Copy failed. Check clipboard permissions')
}

export async function copyMatrix() {
  const ok = await copyText(matrixMarkdown(get().items))
  toast(ok ? 'Lanes copied as Markdown' : 'Copy failed. Check clipboard permissions')
}

export function downloadCalendar() {
  const today = todayKey()
  const ics = planICS(get().items, today)
  if (!ics) return toast('Nothing planned on a day yet', 'shift+3')
  download(`composure-${today}.ics`, 'text/calendar', ics)
  toast('Calendar file downloaded. Open it to import')
}

export function sendToThings() {
  const url = thingsURL(get().items, todayKey())
  if (!url) return toast('Nothing planned yet', 'shift+3')
  window.location.href = url
  toast('Opening Things 3…')
}

// ---------------------------------------------------------------- a work session, back to Things

/** Today's tasks to send: one session (the one you're in, or the running one) or all of them. */
function sendable(scope: 'session' | 'all') {
  const { items, run } = get()
  const session = scope === 'session' ? (run?.session ?? todayCurrent()?.session) : undefined
  return sessionTasks(items, todayKey(), session)
}

/** What a send covers, in words, for toasts. */
const count = (n: number) => `${n} ${n === 1 ? 'task' : 'tasks'}`

/**
 * ⌥S / ⌥⇧S: opens Things with the finished tasks completed (they land in its Logbook) and the rest
 * open. Nothing leaves Composure until you confirm it arrived. A long list goes in several links:
 * the first opens now and ⌥N opens each next.
 */
export function sendSessionToThings(scope: 'session' | 'all') {
  const tasks = sendable(scope)
  if (!tasks.length) return toast('Nothing in today to send')
  const links = thingsSessionLinks(get().items, tasks)
  outboxSet(tasks.map((t) => t.id), links.length)
  window.location.href = links[0]
  toast(
    links.length > 1
      ? `Opening Things 3 (part 1 of ${links.length}). ⌥N sends the next`
      : `Opening Things 3 with ${count(tasks.length)}. Did they arrive? ⌥↵ clears them here`,
  )
}

/** ⌥N: the next link of a long send. */
export function sendNextPart() {
  const { outbox, items } = get()
  if (!outbox || outbox.sent >= outbox.parts) return
  const byId = new Map(items.map((i) => [i.id, i]))
  const tasks = outbox.ids.flatMap((id) => byId.get(id) ?? [])
  const link = thingsSessionLinks(items, tasks)[outbox.sent]
  if (!link) return
  outboxSentPart()
  window.location.href = link
  toast(`Opening Things 3 (part ${outbox.sent + 1} of ${outbox.parts})`)
}

/** The same tasks as `- [x]` / `- [ ]` lines, for pasting into Things by hand if the link fails. */
export async function copySessionMarkdown(scope: 'session' | 'all') {
  const tasks = sendable(scope)
  if (!tasks.length) return toast('Nothing in today to copy')
  const ok = await copyText(sessionMarkdown(tasks))
  toast(ok ? `Copied ${count(tasks.length)} as Markdown. Paste them into Things` : 'Copy failed. Check clipboard permissions')
}

export function downloadBackup() {
  const { items, sessionNames } = get()
  if (!items.length) return toast('Nothing to export yet', 'shift+1')
  download(`composure-${todayKey()}.json`, 'application/json', makeBackup(items, sessionNames))
  toast(`Exported ${items.length} ${items.length === 1 ? 'thought' : 'thoughts'}. Import it anywhere with ⌘O`)
}

/**
 * Imports a file: a Composure export brings everything back exactly (times, subtasks, where each
 * thought is filed); a Markdown or text list becomes new thoughts, one per line. Nothing here is
 * overwritten, and ⌘Z takes the import back.
 */
export async function importFile(file: File) {
  try {
    const text = await file.text()
    const isExport = text.trimStart().startsWith('{')
    const incoming = isExport ? parseBackup(text) : parseNotes(text).map(({ text: t, done }) => ({ ...makeItem(t), done }))
    if (!incoming.length) return toast('Nothing to import in that file')
    if (isExport) set({ sessionNames: mergeSessionNames(get().sessionNames, parseSessionNames(text)) })
    const { added, skipped } = importItems(incoming)
    const what = `${added} ${added === 1 ? 'thought' : 'thoughts'}`
    if (!added) return toast(`Already here: all ${skipped} thoughts`)
    toast(skipped ? `Imported ${what} (${skipped} already here)` : `Imported ${what}`, 'mod+z')
  } catch (err) {
    toast(`Import failed: ${err instanceof SyntaxError ? 'not a Composure export' : (err as Error).message}`)
  }
}

export function pickImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,.md,.markdown,.txt,application/json,text/markdown,text/plain'
  input.onchange = () => {
    const file = input.files?.[0]
    if (file) void importFile(file)
  }
  input.click()
}
