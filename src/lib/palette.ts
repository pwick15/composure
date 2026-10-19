import { COMMANDS, GROUP_ORDER, inScope, titleOf, type Command } from '../keyboard/commands'
import { fuzzyBest, fuzzyMatch, SUBSTRING } from './fuzzy'
import { archivedIds } from './selectors'
import { leaves } from './tree'
import type { Item, Mode } from './types'

export type Row =
  | { kind: 'command'; cmd: Command; title: string; indices: number[] }
  | { kind: 'item'; item: Item; indices: number[] }
  | { kind: 'create'; text: string }

export interface Section {
  title: string
  rows: Row[]
}

const SECTION_FOR_MODE: Record<Mode, string> = { dump: 'Dump', sort: 'Sort', plan: 'Plan', today: 'Today', archive: 'Archive' }

function available(mode: Mode) {
  return COMMANDS.filter((c) => c.palette !== false && inScope(c, mode))
}

export function buildSections(query: string, mode: Mode, items: Item[]): Section[] {
  const cmds = available(mode)
  const q = query.trim()

  if (!q) {
    // Browse mode: every command, grouped, current mode's group first after Modes.
    const order = [...GROUP_ORDER].sort((a, b) => {
      const rank = (g: string) => (g === 'Modes' ? 0 : g === SECTION_FOR_MODE[mode] ? 1 : 2)
      return rank(a) - rank(b)
    })
    return order
      .map((g) => ({
        title: g,
        rows: cmds
          .filter((c) => c.group === g)
          .map((cmd): Row => ({ kind: 'command', cmd, title: titleOf(cmd), indices: [] })),
      }))
      .filter((s) => s.rows.length)
  }

  const commandRows = cmds
    .map((cmd) => {
      const title = titleOf(cmd)
      const m = fuzzyBest(q, title, `${cmd.keywords ?? ''} ${cmd.group}`)
      return m && { row: { kind: 'command', cmd, title, indices: m.indices } as Row, score: m.score }
    })
    .filter((r): r is { row: Row; score: number } => Boolean(r))
    .sort((a, b) => b.score - a.score)
    .slice(0, 7)

  // Finished thoughts live in the Archive: they get a section of their own, below everything
  // you can still act on, so they never crowd out what you're looking for.
  const finished = archivedIds(items)
  const find = (list: Item[], limit: number) =>
    list
      .map((item) => {
        const m = fuzzyMatch(q, item.text)
        return m && { row: { kind: 'item', item, indices: m.indices } as Row, score: m.score }
      })
      .filter((r): r is { row: Row; score: number } => Boolean(r))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  const itemRows = find(items.filter((i) => !finished.has(i.id)), 6)
  const archiveRows = find(leaves(items).filter((i) => finished.has(i.id)), 4)

  const create: Section = { title: 'New', rows: [{ kind: 'create', text: q }] }
  const sections: Section[] = []
  const commands: Section | null = commandRows.length ? { title: 'Commands', rows: commandRows.map((r) => r.row) } : null
  const thoughts: Section | null = itemRows.length ? { title: 'Thoughts', rows: itemRows.map((r) => r.row) } : null
  // Commands come first, unless a thought contains the query word for word and no command does.
  const thoughtsFirst = (itemRows[0]?.score ?? 0) >= SUBSTRING && (commandRows[0]?.score ?? 0) < SUBSTRING
  for (const s of thoughtsFirst ? [thoughts, commands] : [commands, thoughts]) if (s) sections.push(s)
  if (archiveRows.length) sections.push({ title: 'Archive', rows: archiveRows.map((r) => r.row) })
  // Weak or no matches: adding the text as a thought is the likely intent.
  const best = Math.max(commandRows[0]?.score ?? -Infinity, itemRows[0]?.score ?? -Infinity)
  return best < 15 ? [create, ...sections] : [...sections, create]
}
