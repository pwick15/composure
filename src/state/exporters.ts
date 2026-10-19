import { todayKey } from '../lib/dates'
import { makeBackup, matrixMarkdown, mergeSessionNames, parseBackup, parseSessionNames, planICS, planMarkdown, thingsURL } from '../lib/export'
import { parseNotes } from '../lib/text'
import { importItems, makeItem, toast } from './actions'
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
  toast(ok ? 'Priorities copied as Markdown' : 'Copy failed. Check clipboard permissions')
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
