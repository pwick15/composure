export interface FuzzyResult {
  score: number
  /** Indices into the target string that matched, for highlighting. */
  indices: number[]
}

const isBoundary = (s: string, i: number) => i === 0 || /[\s\-_/.·:]/.test(s[i - 1])

function subsequence(q: string, t: string, preferBoundaries: boolean): FuzzyResult | null {
  const indices: number[] = []
  let score = 0
  let from = 0
  let prev = -2
  for (const ch of q) {
    let found = t.indexOf(ch, from)
    if (found === -1) return null
    if (preferBoundaries && found !== prev + 1 && !isBoundary(t, found)) {
      for (let i = found + 1; i < t.length; i++) {
        if (t[i] === ch && isBoundary(t, i)) {
          found = i
          break
        }
      }
    }
    score += found === prev + 1 ? 12 : isBoundary(t, found) ? 9 : 1
    score -= Math.min(found - from, 8) * 0.4
    indices.push(found)
    prev = found
    from = found + 1
  }
  return { score, indices }
}

/**
 * Small fzf-style matcher. Substring hits rank above scattered subsequences,
 * and word-start hits rank above mid-word ones. Spaces in the query are ignored.
 */
export function fuzzyMatch(query: string, target: string): FuzzyResult | null {
  const q = query.toLowerCase().replace(/\s+/g, ' ').trim()
  if (!q) return { score: 0, indices: [] }
  const t = target.toLowerCase()

  const sub = t.indexOf(q)
  if (sub !== -1) {
    const indices = Array.from({ length: q.length }, (_, i) => sub + i)
    const score = 1000 + (sub === 0 ? 300 : 0) + (isBoundary(t, sub) ? 150 : 0) - sub - t.length * 0.2
    return { score, indices }
  }

  const compact = q.replace(/ /g, '')
  return subsequence(compact, t, true) ?? subsequence(compact, t, false)
}

/** Best match across a primary label and optional keywords; indices refer to the label only. */
export function fuzzyBest(query: string, label: string, keywords?: string): FuzzyResult | null {
  const primary = fuzzyMatch(query, label)
  const extra = keywords ? fuzzyMatch(query, keywords) : null
  if (primary && (!extra || primary.score >= extra.score * 0.8)) return primary
  if (extra) return { score: extra.score * 0.8, indices: [] }
  return primary
}
