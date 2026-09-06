import { parseSitemap } from '../core/sitemap.js'
import { parseRobots, isAllowed, PERMISSIVE, type RobotsRules } from '../core/robots.js'
import { normalizeUrl, resolveUrl, sameOrigin, looksLikeHtmlPage } from '../core/url.js'
import { parseHtml } from './offscreen.js'
import type { Settings } from '../core/settings.js'
import type { CollectedRef } from '../core/messages.js'

export interface CrawlHooks {
  /** Called once per crawled page with everything that page references. */
  onPage: (pageUrl: string, refs: CollectedRef[]) => void
  onProgress: (crawled: number, queued: number) => void
  shouldStop: () => boolean
}

interface Frontier {
  url: string
  depth: number
}

/**
 * Breadth-first crawl of one origin.
 *
 * Only same-origin HTML pages are ever *visited*; every link found is still
 * reported for checking, so external links get validated without the crawler
 * wandering off into the internet.
 */
export async function crawlSite(
  startUrl: string,
  settings: Settings,
  hooks: CrawlHooks,
): Promise<void> {
  const start = normalizeUrl(startUrl)
  if (!start) return

  const rules = settings.respectRobots ? await fetchRobots(start) : PERMISSIVE
  const visited = new Set<string>([start])
  const frontier: Frontier[] = []

  if (settings.useSitemap) {
    for (const url of await seedFromSitemaps(start, rules)) {
      const n = normalizeUrl(url)
      if (n && sameOrigin(n, start) && !visited.has(n)) {
        visited.add(n)
        frontier.push({ url: n, depth: 1 })
      }
    }
  }
  frontier.unshift({ url: start, depth: 0 })

  let crawled = 0
  while (frontier.length > 0 && crawled < settings.maxPages) {
    if (hooks.shouldStop()) return
    const next = frontier.shift()!
    if (settings.respectRobots && !isAllowed(rules, next.url)) continue

    const html = await fetchHtml(next.url, settings.timeoutMs)
    crawled++
    hooks.onProgress(crawled, frontier.length)
    if (html === null) continue

    const parsed = await parseHtml(html, {
      images: settings.checkImages,
      scripts: settings.checkScripts,
      stylesheets: settings.checkStylesheets,
    })

    const refs: CollectedRef[] = parsed.map((p, i) => ({
      elementId: `crawl-${crawled}-${i}`,
      raw: p.raw,
      kind: p.kind,
      text: p.text,
      anchorFound: p.anchorFound,
    }))
    hooks.onPage(next.url, refs)

    if (next.depth >= settings.maxDepth) continue
    for (const ref of parsed) {
      if (ref.kind !== 'link') continue
      const abs = resolveUrl(ref.raw, next.url)
      const n = abs ? normalizeUrl(abs) : null
      if (!n || visited.has(n)) continue
      if (!sameOrigin(n, start) || !looksLikeHtmlPage(n)) continue
      visited.add(n)
      frontier.push({ url: n, depth: next.depth + 1 })
    }
    if (rules.crawlDelayMs > 0) await sleep(rules.crawlDelayMs)
  }
  hooks.onProgress(crawled, 0)
}

async function fetchRobots(origin: string): Promise<RobotsRules> {
  try {
    const url = new URL('/robots.txt', origin).href
    const res = await fetch(url, { credentials: 'omit', cache: 'no-cache' })
    if (!res.ok) return PERMISSIVE
    return parseRobots(await res.text())
  } catch {
    return PERMISSIVE
  }
}

/** Follows one level of sitemap-index nesting; deeper trees are rare and slow. */
async function seedFromSitemaps(origin: string, rules: RobotsRules): Promise<string[]> {
  const candidates = rules.sitemaps.length > 0 ? rules.sitemaps : [new URL('/sitemap.xml', origin).href]
  const urls: string[] = []
  for (const sm of candidates.slice(0, 3)) {
    const xml = await fetchText(sm)
    if (!xml) continue
    const parsed = parseSitemap(xml)
    urls.push(...parsed.urls)
    for (const nested of parsed.sitemaps.slice(0, 3)) {
      const inner = await fetchText(nested)
      if (inner) urls.push(...parseSitemap(inner).urls)
    }
  }
  return urls
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: 'omit', cache: 'no-cache' })
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
}

async function fetchHtml(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { credentials: 'include', cache: 'no-cache', signal: controller.signal })
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? ''
    if (!type.includes('html')) return null
    return await res.text()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
