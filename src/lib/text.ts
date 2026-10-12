const BULLET = /^\s*(?:[-*•+–]|\d+[.)]|\[[ xX]?\])\s+/

/** Turns pasted notes (bullets, numbered lists, checklists) into one clean line per item. */
export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(BULLET, '').replace(BULLET, '').trim())
    .filter(Boolean)
}
