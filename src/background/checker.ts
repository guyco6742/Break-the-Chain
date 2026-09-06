import type { RedirectHop } from '../core/types.js'
import { RedirectTracker, hasLoop } from './redirects.js'

export interface CheckOptions {
  timeoutMs: number
  retries: number
}

export interface CheckOutcome {
  status: number | null
  statusText: string
  finalUrl: string | null
  redirects: RedirectHop[]
  redirectLoop: boolean
  contentType: string | null
  durationMs: number
  error: string | null
  /** Parsed from the Retry-After header on a 429/503, in ms. */
  retryAfterMs: number | null
}

/**
 * Sent on every check so the request reads like a navigation rather than a
 * script call. `Origin` and the `Sec-Fetch-*` headers are handled separately by
 * declarativeNetRequest, because fetch() refuses to set them.
 */
const BROWSER_HEADERS: Record<string, string> = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
}

/** Statuses that usually mean "this server dislikes HEAD", not "this is broken". */
const RETRY_WITH_GET = new Set([400, 403, 404, 405, 406, 409, 500, 501, 502])

/**
 * Check one URL.
 *
 * HEAD first (cheap), falling back to GET when the server answers with one of
 * the statuses that commonly just means HEAD is unsupported. The GET response
 * body is aborted as soon as the headers arrive, so a 200 MB PDF costs us
 * headers, not 200 MB.
 */
export async function checkUrl(
  url: string,
  opts: CheckOptions,
  tracker: RedirectTracker,
): Promise<CheckOutcome> {
  const started = Date.now()
  let lastError: string | null = null

  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    tracker.watch(url)
    const head = await attemptFetch(url, 'HEAD', opts.timeoutMs)

    if (head.ok && head.status !== null && !RETRY_WITH_GET.has(head.status)) {
      return finish(url, head, tracker, started)
    }

    const get = await attemptFetch(url, 'GET', opts.timeoutMs)
    if (get.ok) return finish(url, get, tracker, started)

    // Keep whichever attempt produced a real status before giving up.
    if (head.ok) return finish(url, head, tracker, started)

    lastError = get.error ?? head.error ?? 'Request failed'
    tracker.take(url)
    if (attempt < opts.retries) await sleep(250 * (attempt + 1))
  }

  return {
    status: null, statusText: '', finalUrl: null, redirects: [], redirectLoop: false,
    contentType: null, durationMs: Date.now() - started, error: lastError, retryAfterMs: null,
  }
}

interface Attempt {
  ok: boolean
  status: number | null
  statusText: string
  finalUrl: string | null
  contentType: string | null
  retryAfter: number | null
  error: string | null
}

async function attemptFetch(url: string, method: 'HEAD' | 'GET', timeoutMs: number): Promise<Attempt> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs)
  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      credentials: 'include',
      cache: 'no-cache',
      signal: controller.signal,
      headers: BROWSER_HEADERS,
    })
    // Headers are in; we never want the body.
    if (method === 'GET') controller.abort()
    return {
      ok: true,
      status: res.status,
      statusText: res.statusText,
      finalUrl: res.url || url,
      contentType: res.headers.get('content-type'),
      retryAfter: parseRetryAfter(res.headers.get('retry-after')),
      error: null,
    }
  } catch (e) {
    const err = e as Error
    const message =
      err.name === 'TimeoutError' || err.name === 'AbortError'
        ? `Timed out after ${timeoutMs} ms`
        : err.message || 'Network error'
    return { ok: false, status: null, statusText: '', finalUrl: null, contentType: null, retryAfter: null, error: message }
  } finally {
    clearTimeout(timer)
  }
}

function finish(url: string, a: Attempt, tracker: RedirectTracker, started: number): CheckOutcome {
  const redirects = tracker.take(url)
  return {
    status: a.status,
    statusText: a.statusText,
    finalUrl: a.finalUrl,
    redirects,
    redirectLoop: hasLoop(redirects, url),
    contentType: a.contentType,
    durationMs: Date.now() - started,
    error: null,
    retryAfterMs: a.retryAfter,
  }
}

/**
 * Retry-After is either a delay in seconds or an HTTP date. Capped at two
 * minutes: a server asking us to wait an hour means "not today", not "sleep".
 */
export function parseRetryAfter(value: string | null): number | null {
  if (!value) return null
  const seconds = Number(value.trim())
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 120_000)
  const when = Date.parse(value)
  if (Number.isNaN(when)) return null
  return Math.min(Math.max(when - Date.now(), 0), 120_000)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
