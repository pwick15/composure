const BULLET = /^\s*(?:[-*•+–]|\d+[.)]|\[[ xX]?\])\s+/

/** The day/month/year that Things puts in front of a copied task: `24/10/2026 Update my MacBook OS`. */
const LEADING_DATE = /^(?:0?[1-9]|[12]\d|3[01])\/(?:0?[1-9]|1[0-2])\/\d{4}\s+(?=\S)/

/** Turns pasted notes (bullets, numbered lists, checklists) into one clean line per item. */
export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(BULLET, '').replace(BULLET, '').trim().replace(LEADING_DATE, ''))
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
