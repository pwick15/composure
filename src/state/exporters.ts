import { todayKey } from '../lib/dates'
import { makeBackup, matrixMarkdown, parseBackup, planICS, planMarkdown, thingsURL } from '../lib/export'
import { replaceItems, toast } from './actions'
import { getState as get } from './store'

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
  download(`composure-backup-${todayKey()}.json`, 'application/json', makeBackup(get().items))
  toast('Backup downloaded')
}

export function restoreBackup() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json,.json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const items = parseBackup(await file.text())
      replaceItems(items)
      toast(`Restored ${items.length} items`, 'mod+z')
    } catch (err) {
      toast(`Restore failed: ${(err as Error).message}`)
    }
  }
  input.click()
}
