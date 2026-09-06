const UNCHECKABLE = ['mailto:', 'tel:', 'javascript:', 'data:', 'blob:', 'about:', 'sms:', 'ftp:', 'file:']

/** Schemes we can't meaningfully send an HTTP request to. */
export function isUncheckableScheme(raw: string): boolean {
  const v = raw.trim().toLowerCase()
  return UNCHECKABLE.some((p) => v.startsWith(p))
}

/** href="" / href="#" / whitespace only — an authoring mistake, not a broken link. */
export function isEmptyHref(raw: string | null | undefined): boolean {
  if (raw == null) return true
  const v = raw.trim()
  return v === '' || v === '#'
}

/** "#section" — resolved against the page's own DOM, never over the network. */
export function isInPageAnchor(raw: string): boolean {
  const v = raw.trim()
  return v.length > 1 && v.startsWith('#')
}

/** Absolute URL, or null when the href can't be resolved at all. */
export function resolveUrl(raw: string, base: string): string | null {
  try {
    return new URL(raw, base).href
  } catch {
    return null
  }
}

/**
 * Canonical form used as the dedupe/cache key.
 * Drops the fragment, lowercases scheme+host, strips a default port and a
 * trailing "/" on a bare origin. Query strings are preserved and order-sensitive
 * on purpose: ?a=1&b=2 and ?b=2&a=1 may be different pages.
 */
export function normalizeUrl(input: string): string | null {
  let u: URL
  try {
    u = new URL(input)
  } catch {
    return null
  }
  u.hash = ''
  u.protocol = u.protocol.toLowerCase()
  u.hostname = u.hostname.toLowerCase()
  if ((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443')) {
    u.port = ''
  }
  let out = u.href
  if (u.pathname === '/' && !u.search) out = out.replace(/\/$/, '')
  return out
}

export function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin
  } catch {
    return false
  }
}

export function hostOf(input: string): string {
  try {
    return new URL(input).hostname
  } catch {
    return ''
  }
}

/** Rough "is this a page I could crawl" test — skips obvious asset URLs. */
const ASSET_EXT =
  /\.(png|jpe?g|gif|webp|avif|svg|ico|css|js|mjs|json|xml|zip|gz|rar|7z|pdf|docx?|xlsx?|pptx?|mp[34]|m4[av]|wav|ogg|webm|mov|avi|woff2?|ttf|otf|eot)$/i

export function looksLikeHtmlPage(input: string): boolean {
  try {
    const path = new URL(input).pathname
    return !ASSET_EXT.test(path)
  } catch {
    return false
  }
}
