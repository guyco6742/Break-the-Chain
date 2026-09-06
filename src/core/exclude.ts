/**
 * A URL exclusion rule. Two syntaxes, on purpose:
 *   - glob-ish:  a bare "*" wildcard anywhere, e.g. "*.example.com" or
 *                "*wp-admin*"
 *   - regex:     "/\\.pdf($|\\?)/i"  (leading and trailing slash, optional flags)
 * A bare token with no wildcard is treated as a substring match, which is what
 * people actually mean when they type "facebook.com" into an exclude box.
 */
export type Matcher = (url: string) => boolean

export function compilePattern(pattern: string): Matcher | null {
  const p = pattern.trim()
  if (!p) return null

  const re = /^\/(.*)\/([gimsuy]*)$/.exec(p)
  if (re) {
    try {
      const rx = new RegExp(re[1], re[2].replace('g', ''))
      return (url) => rx.test(url)
    } catch {
      return null
    }
  }

  if (p.includes('*') || p.includes('?')) {
    const rx = new RegExp(
      '^' +
        p
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.') +
        '$',
      'i',
    )
    return (url) => rx.test(url)
  }

  const lower = p.toLowerCase()
  return (url) => url.toLowerCase().includes(lower)
}

export function compileExcludes(patterns: string[]): Matcher {
  const matchers = patterns.map(compilePattern).filter((m): m is Matcher => m !== null)
  if (matchers.length === 0) return () => false
  return (url) => matchers.some((m) => m(url))
}
