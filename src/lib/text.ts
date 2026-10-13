const BULLET = /^\s*(?:[-*•+–]|\d+[.)]|\[[ xX]?\])\s+/

/** Turns pasted notes (bullets, numbered lists, checklists) into one clean line per item. */
export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(BULLET, '').replace(BULLET, '').trim())
    .filter(Boolean)
}

/**
 * Reads a notes file (Markdown, plain text, our own Markdown exports) as a list of thoughts:
 * one per line, headings and rules skipped, `[x]` kept as done.
 */
export function parseNotes(text: string): { text: string; done: boolean }[] {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*(#{1,6}\s|[-*_]{3,}\s*$)/.test(line))
    .flatMap((line) => {
      const done = /^\s*(?:[-*+•]\s+)?\[[xX]\]\s/.test(line)
      const [clean] = splitLines(line)
      return clean ? [{ text: clean, done }] : []
    })
}
