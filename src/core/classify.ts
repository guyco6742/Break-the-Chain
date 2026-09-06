import type { LinkCategory } from './types.js'

/**
 * Map an HTTP status to a category.
 *
 * 401/403/429 are deliberately "warning" rather than "invalid": the resource
 * very often exists and is simply refusing an unauthenticated or rate-limited
 * HEAD from an extension. Reporting those as broken is the single biggest
 * source of false positives in link checkers.
 */
export function classifyStatus(status: number): LinkCategory {
  if (status >= 200 && status < 300) return 'valid'
  if (status >= 300 && status < 400) return 'redirect'
  if (status === 401 || status === 403 || status === 429) return 'warning'
  if (status >= 400) return 'invalid'
  return 'warning'
}

export function isBroken(category: LinkCategory): boolean {
  return category === 'invalid'
}

const LABELS: Record<number, string> = {
  200: 'OK', 201: 'Created', 204: 'No Content',
  301: 'Moved Permanently', 302: 'Found', 303: 'See Other',
  307: 'Temporary Redirect', 308: 'Permanent Redirect',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
  404: 'Not Found', 405: 'Method Not Allowed', 408: 'Request Timeout',
  410: 'Gone', 429: 'Too Many Requests',
  500: 'Internal Server Error', 502: 'Bad Gateway',
  503: 'Service Unavailable', 504: 'Gateway Timeout',
}

export function statusLabel(status: number | null, fallback = ''): string {
  if (status == null) return fallback
  return LABELS[status] ?? fallback
}

/**
 * Big commerce and CDN-fronted sites (Etsy, Amazon, Cloudflare/Akamai customers)
 * answer automated requests with 401/403/429 while serving the same URL happily
 * to a real tab. Reporting those as broken links is wrong and destroys trust in
 * the whole report, so they are surfaced as warnings with an explanation.
 */
export function statusNote(status: number | null, finalUrl: string | null): string | null {
  // Every note names the exact control the user would reach for. The wording
  // here must match the labels in options.html — telling someone to "lower the
  // concurrency" when the field is called "Parallel per host" is a bug.
  if (status === 403)
    return 'Blocked (403). The site is refusing automated requests — bot protection, not necessarily a broken link. Open it in a tab to confirm, or add it under Settings → Exclusions → URL patterns.'
  if (status === 401) return 'Requires sign-in (401). The URL exists but is behind authentication.'
  if (status === 429)
    return 'Rate limited (429), and backing off did not help. Under Settings → Speed & politeness, lower “Parallel per host” or raise “Delay per host (ms)”, then re-check.'
  if (status === 405) return 'The server rejected the request method even after the GET fallback.'
  if (status === 999) return `Non-standard block status returned by ${finalUrl ?? 'the site'} (LinkedIn does this).`
  return null
}
