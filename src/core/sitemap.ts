export interface SitemapResult {
  /** Page URLs found in a <urlset>. */
  urls: string[]
  /** Nested sitemap URLs found in a <sitemapindex>. */
  sitemaps: string[]
}

const LOC = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi
const IS_INDEX = /<sitemapindex[\s>]/i

/**
 * Extracted with a regex rather than DOMParser on purpose: this runs inside the
 * MV3 service worker, which has no DOM. Sitemaps are a flat, machine-generated
 * format, so the trade-off is safe here — unlike page HTML, which is parsed in
 * an offscreen document.
 */
export function parseSitemap(xml: string): SitemapResult {
  const locs: string[] = []
  LOC.lastIndex = 0
  for (let m = LOC.exec(xml); m !== null; m = LOC.exec(xml)) {
    const value = decodeXmlEntities(m[1].trim())
    if (value) locs.push(value)
  }
  return IS_INDEX.test(xml) ? { urls: [], sitemaps: locs } : { urls: locs, sitemaps: [] }
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}
