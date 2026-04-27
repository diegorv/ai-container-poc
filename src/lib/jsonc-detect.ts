/**
 * Heuristic check: does the source contain JSONC-only syntax (line or
 * block comments, trailing commas) that JSON.parse + JSON.stringify
 * would silently strip? Used by mydevc mount to warn before rewriting
 * a user-edited devcontainer.json. We do not parse JSONC here — just
 * detect that it would be lossy to round-trip.
 *
 * The implementation walks the string in one pass and tracks whether
 * the cursor is inside a string literal so that a URL like
 * "https://x.com/" does not trigger a false positive on the //.
 */
export function hasJsoncSyntax(source: string): boolean {
  let i = 0
  const n = source.length
  let inString = false
  let stringQuote: '"' | "'" | null = null
  let escaped = false

  while (i < n) {
    const ch = source[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === stringQuote) {
        inString = false
        stringQuote = null
      }
      i += 1
      continue
    }

    if (ch === '"' || ch === "'") {
      inString = true
      stringQuote = ch as '"' | "'"
      i += 1
      continue
    }

    if (ch === '/' && i + 1 < n) {
      const next = source[i + 1]
      if (next === '/' || next === '*') return true
    }

    if (ch === ',') {
      let j = i + 1
      while (j < n && /\s/.test(source[j] ?? '')) j += 1
      if (j < n) {
        const nextNonSpace = source[j]
        if (nextNonSpace === ']' || nextNonSpace === '}') return true
      }
    }

    i += 1
  }
  return false
}
