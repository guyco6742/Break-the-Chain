/** Every category a checked resource can end up in. */
export type LinkCategory =
  | 'valid'      // 2xx
  | 'redirect'   // 3xx (or followed to a different final URL)
  | 'warning'    // 401 / 403 / 429 — reachable but we can't prove it's fine
  | 'invalid'    // 4xx / 5xx / network failure / timeout
  | 'excluded'   // matched an exclusion rule
  | 'skipped'    // mailto:, tel:, javascript:, data: …
  | 'empty'      // href missing or "" or "#"
  | 'pending'

export type ResourceKind = 'link' | 'image' | 'script' | 'stylesheet' | 'anchor'

/** One hop in a redirect chain. */
export interface RedirectHop {
  from: string
  to: string
  status: number
}

export interface LinkRecord {
  /** Stable id, also written to the DOM element as data-btc-id. */
  id: string
  url: string
  /** Raw href/src exactly as authored, before resolution. */
  raw: string
  kind: ResourceKind
  /** Visible anchor text / alt text, trimmed. */
  text: string
  /** Page the link was found on (matters for crawls). */
  foundOn: string
  category: LinkCategory
  status: number | null
  statusText: string
  finalUrl: string | null
  redirects: RedirectHop[]
  /** True when the redirect chain loops back on itself. */
  redirectLoop: boolean
  contentType: string | null
  durationMs: number | null
  error: string | null
  /** Human explanation when a status needs context (bot protection, auth walls). */
  note: string | null
  /** How many times this exact URL appears in the scan. */
  occurrences: number
  checkedAt: number
}

export interface ScanTotals {
  total: number
  checked: number
  valid: number
  redirect: number
  warning: number
  invalid: number
  excluded: number
  skipped: number
  empty: number
}

export type ScanMode = 'page' | 'site'

export interface ScanState {
  id: string
  mode: ScanMode
  origin: string
  startedAt: number
  finishedAt: number | null
  running: boolean
  /** Crawl only: pages visited / queued. */
  pagesCrawled: number
  pagesQueued: number
  totals: ScanTotals
  results: LinkRecord[]
}

export const EMPTY_TOTALS: ScanTotals = {
  total: 0, checked: 0, valid: 0, redirect: 0, warning: 0,
  invalid: 0, excluded: 0, skipped: 0, empty: 0,
}
