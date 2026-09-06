export interface RobotsRules {
  /** Longest-match allow/disallow paths for the group that applies to us. */
  allow: string[]
  disallow: string[]
  sitemaps: string[]
  crawlDelayMs: number
}

export const PERMISSIVE: RobotsRules = { allow: [], disallow: [], sitemaps: [], crawlDelayMs: 0 }

/**
 * Minimal robots.txt parser, good enough to be a good citizen.
 * Picks the most specific matching group: our own UA name if present,
 * otherwise "*". Groups for other agents are ignored.
 */
export function parseRobots(text: string, userAgent = 'break-the-chain'): RobotsRules {
  const groups = new Map<string, RobotsRules>()
  let current: string[] = []
  let sawDirective = false
  const sitemaps: string[] = []

  const ensure = (ua: string): RobotsRules => {
    let g = groups.get(ua)
    if (!g) { g = { allow: [], disallow: [], sitemaps: [], crawlDelayMs: 0 }; groups.set(ua, g) }
    return g
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const field = line.slice(0, idx).trim().toLowerCase()
    const value = line.slice(idx + 1).trim()

    switch (field) {
      case 'user-agent':
        if (sawDirective) { current = []; sawDirective = false }
        current.push(value.toLowerCase())
        ensure(value.toLowerCase())
        break
      case 'disallow':
        sawDirective = true
        for (const ua of current) if (value) ensure(ua).disallow.push(value)
        break
      case 'allow':
        sawDirective = true
        for (const ua of current) if (value) ensure(ua).allow.push(value)
        break
      case 'crawl-delay': {
        sawDirective = true
        const secs = Number.parseFloat(value)
        if (Number.isFinite(secs)) for (const ua of current) ensure(ua).crawlDelayMs = secs * 1000
        break
      }
      case 'sitemap':
        if (value) sitemaps.push(value)
        break
    }
  }

  const chosen = groups.get(userAgent.toLowerCase()) ?? groups.get('*') ?? { ...PERMISSIVE }
  return { ...chosen, sitemaps }
}

/** Google's longest-match-wins rule; ties go to allow. */
export function isAllowed(rules: RobotsRules, url: string): boolean {
  let path: string
  try {
    const u = new URL(url)
    path = u.pathname + u.search
  } catch {
    return true
  }
  const best = (patterns: string[]): number => {
    let len = -1
    for (const p of patterns) if (matchPath(p, path)) len = Math.max(len, p.length)
    return len
  }
  const dis = best(rules.disallow)
  if (dis === -1) return true
  return best(rules.allow) >= dis
}

function matchPath(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$')
  const body = anchored ? pattern.slice(0, -1) : pattern
  const rx = new RegExp(
    '^' + body.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + (anchored ? '$' : ''),
  )
  return rx.test(path)
}
