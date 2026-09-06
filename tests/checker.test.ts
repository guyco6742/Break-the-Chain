import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkUrl, parseRetryAfter } from '../src/background/checker.js'
import { RedirectTracker, hasLoop } from '../src/background/redirects.js'

const tracker = new RedirectTracker() // attach() is a no-op without chrome.webRequest
const opts = { timeoutMs: 500, retries: 0 }

const response = (status: number, init: { url?: string; type?: string; retryAfter?: string } = {}) => {
  const headers = new Headers()
  if (init.type) headers.set('content-type', init.type)
  if (init.retryAfter) headers.set('retry-after', init.retryAfter)
  return { status, statusText: '', url: init.url ?? 'https://a.com/x', headers } as unknown as Response
}

beforeEach(() => tracker.reset())
afterEach(() => vi.unstubAllGlobals())

describe('checkUrl', () => {
  it('uses HEAD when the server answers it', async () => {
    const methods: (string | undefined)[] = []
    const fetchMock = vi.fn(async (_u: string, init: RequestInit) => {
      methods.push(init.method)
      return response(200)
    })
    vi.stubGlobal('fetch', fetchMock)
    const out = await checkUrl('https://a.com/x', opts, tracker)
    expect(out.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(methods).toEqual(['HEAD'])
  })

  it('falls back to GET when HEAD is rejected with 405', async () => {
    const fetchMock = vi.fn(async (_u: string, init: RequestInit) =>
      init.method === 'HEAD' ? response(405) : response(200),
    )
    vi.stubGlobal('fetch', fetchMock)
    const out = await checkUrl('https://a.com/x', opts, tracker)
    expect(out.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reports a genuine 404 after the GET fallback also fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(404)))
    const out = await checkUrl('https://a.com/missing', opts, tracker)
    expect(out.status).toBe(404)
    expect(out.error).toBeNull()
  })

  it('records the final URL and content type', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(200, { url: 'https://a.com/final', type: 'text/html' })))
    const out = await checkUrl('https://a.com/x', opts, tracker)
    expect(out.finalUrl).toBe('https://a.com/final')
    expect(out.contentType).toBe('text/html')
  })

  it('turns a network failure into an error, not a status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('getaddrinfo ENOTFOUND') }))
    const out = await checkUrl('https://nope.invalid/', opts, tracker)
    expect(out.status).toBeNull()
    expect(out.error).toContain('ENOTFOUND')
  })

  it('retries the configured number of times before giving up', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('flaky') })
    vi.stubGlobal('fetch', fetchMock)
    await checkUrl('https://a.com/x', { timeoutMs: 200, retries: 2 }, tracker)
    // 2 fetches (HEAD + GET) per attempt, 3 attempts
    expect(fetchMock).toHaveBeenCalledTimes(6)
  })

  it('reports a timeout in the error message', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      await new Promise((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('Timeout', 'TimeoutError')))
      })
      return response(200)
    }))
    const out = await checkUrl('https://slow.com/', { timeoutMs: 30, retries: 0 }, tracker)
    expect(out.error).toMatch(/Timed out/)
  })
})

describe('hasLoop', () => {
  it('detects a chain that comes back to a url it already visited', () => {
    expect(hasLoop([
      { from: 'https://a.com/1', to: 'https://a.com/2', status: 301 },
      { from: 'https://a.com/2', to: 'https://a.com/1', status: 302 },
    ], 'https://a.com/1')).toBe(true)
  })
  it('accepts a normal chain', () => {
    expect(hasLoop([
      { from: 'https://a.com/1', to: 'https://a.com/2', status: 301 },
      { from: 'https://a.com/2', to: 'https://a.com/3', status: 301 },
    ], 'https://a.com/1')).toBe(false)
  })
  it('accepts an empty chain', () => expect(hasLoop([], 'https://a.com/1')).toBe(false))
})

describe('parseRetryAfter', () => {
  it('reads a delay in seconds', () => expect(parseRetryAfter('30')).toBe(30_000))
  it('reads an HTTP date', () => {
    const soon = new Date(Date.now() + 20_000).toUTCString()
    expect(parseRetryAfter(soon)).toBeGreaterThan(15_000)
  })
  it('caps an absurd wait at two minutes', () => expect(parseRetryAfter('99999')).toBe(120_000))
  it('never returns a negative wait for a past date', () => {
    expect(parseRetryAfter(new Date(Date.now() - 60_000).toUTCString())).toBe(0)
  })
  it('returns null for junk or a missing header', () => {
    expect(parseRetryAfter(null)).toBeNull()
    expect(parseRetryAfter('soon-ish')).toBeNull()
  })
})

describe('rate limiting', () => {
  it('surfaces the Retry-After a 429 asked for', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(429, { retryAfter: '7' })))
    const out = await checkUrl('https://busy.com/', opts, tracker)
    expect(out.status).toBe(429)
    expect(out.retryAfterMs).toBe(7000)
  })
})
