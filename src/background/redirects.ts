import type { RedirectHop } from '../core/types.js'

/**
 * Records real redirect chains.
 *
 * `fetch(url, { redirect: 'manual' })` returns an opaque response whose headers
 * are unreadable, and `redirect: 'follow'` collapses the whole chain into a
 * single final URL — neither tells you that a link goes 301 -> 302 -> 301 -> 200
 * through four hosts. chrome.webRequest, used purely as an observer (no
 * blocking), is the only way to see the hops, so that is what this does.
 */
export class RedirectTracker {
  private chains = new Map<string, RedirectHop[]>()
  private requestToKey = new Map<string, string>()
  private watching = new Set<string>()
  private attached = false

  /** Safe to call repeatedly; a missing host permission just leaves it off. */
  attach(): boolean {
    if (this.attached) return true
    if (!chrome.webRequest?.onBeforeRedirect) return false
    try {
      const filter: chrome.webRequest.RequestFilter = { urls: ['<all_urls>'] }

      chrome.webRequest.onBeforeRequest.addListener((d) => {
        // tabId -1 means the request came from the extension itself.
        if (d.tabId !== -1) return
        if (this.watching.has(d.url)) this.requestToKey.set(d.requestId, d.url)
      }, filter)

      chrome.webRequest.onBeforeRedirect.addListener((d) => {
        const key = this.requestToKey.get(d.requestId)
        if (!key) return
        const hops = this.chains.get(key) ?? []
        hops.push({ from: d.url, to: d.redirectUrl, status: d.statusCode })
        this.chains.set(key, hops)
      }, filter)

      const finish = (d: { requestId: string }) => this.requestToKey.delete(d.requestId)
      chrome.webRequest.onCompleted.addListener(finish, filter)
      chrome.webRequest.onErrorOccurred.addListener(finish, filter)

      this.attached = true
      return true
    } catch {
      return false
    }
  }

  watch(url: string): void {
    this.watching.add(url)
    this.chains.delete(url)
  }

  /** Reads and clears the chain recorded for a URL. */
  take(url: string): RedirectHop[] {
    const hops = this.chains.get(url) ?? []
    this.chains.delete(url)
    this.watching.delete(url)
    return hops
  }

  reset(): void {
    this.chains.clear()
    this.requestToKey.clear()
    this.watching.clear()
  }
}

/** A chain that revisits a URL it already passed through is a loop. */
export function hasLoop(hops: RedirectHop[], start: string): boolean {
  const seen = new Set<string>([start])
  for (const hop of hops) {
    if (seen.has(hop.to)) return true
    seen.add(hop.to)
  }
  return false
}
