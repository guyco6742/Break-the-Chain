import { describe, it, expect } from 'vitest'
import {
  normalizeUrl, isEmptyHref, isInPageAnchor, isUncheckableScheme,
  resolveUrl, sameOrigin, looksLikeHtmlPage, hostOf, browserRestrictionReason,
} from '../src/core/url.js'

describe('normalizeUrl', () => {
  it('drops the fragment', () => {
    expect(normalizeUrl('https://a.com/x#frag')).toBe('https://a.com/x')
  })
  it('lowercases host but not path', () => {
    expect(normalizeUrl('https://A.COM/Path')).toBe('https://a.com/Path')
  })
  it('strips default ports', () => {
    expect(normalizeUrl('https://a.com:443/x')).toBe('https://a.com/x')
    expect(normalizeUrl('http://a.com:80/x')).toBe('http://a.com/x')
  })
  it('keeps a non-default port', () => {
    expect(normalizeUrl('http://a.com:8080/x')).toBe('http://a.com:8080/x')
  })
  it('normalizes a bare origin', () => {
    expect(normalizeUrl('https://a.com/')).toBe('https://a.com')
  })
  it('preserves the query string verbatim', () => {
    expect(normalizeUrl('https://a.com/?b=2&a=1')).toBe('https://a.com/?b=2&a=1')
  })
  it('returns null on garbage', () => {
    expect(normalizeUrl('not a url')).toBeNull()
  })
})

describe('href classification', () => {
  it('detects empty hrefs', () => {
    for (const v of ['', '   ', '#', null, undefined]) expect(isEmptyHref(v)).toBe(true)
    expect(isEmptyHref('#section')).toBe(false)
  })
  it('detects in-page anchors', () => {
    expect(isInPageAnchor('#section')).toBe(true)
    expect(isInPageAnchor('#')).toBe(false)
    expect(isInPageAnchor('/x#section')).toBe(false)
  })
  it('detects uncheckable schemes', () => {
    for (const v of ['mailto:a@b.c', 'TEL:+123', 'javascript:void(0)', 'data:text/plain,x'])
      expect(isUncheckableScheme(v)).toBe(true)
    expect(isUncheckableScheme('https://a.com')).toBe(false)
  })
})

describe('resolveUrl', () => {
  it('resolves relative paths against the base', () => {
    expect(resolveUrl('../b', 'https://a.com/x/y/')).toBe('https://a.com/x/b')
  })
  it('resolves protocol-relative urls', () => {
    expect(resolveUrl('//cdn.com/a.js', 'https://a.com/')).toBe('https://cdn.com/a.js')
  })
  it('returns null for an unresolvable href', () => {
    expect(resolveUrl('http://[bad', 'https://a.com/')).toBeNull()
  })
})

describe('origin helpers', () => {
  it('compares origins including port and scheme', () => {
    expect(sameOrigin('https://a.com/x', 'https://a.com/y')).toBe(true)
    expect(sameOrigin('https://a.com', 'http://a.com')).toBe(false)
    expect(sameOrigin('https://a.com', 'https://b.com')).toBe(false)
  })
  it('extracts the host', () => {
    expect(hostOf('https://a.com:8080/x')).toBe('a.com')
    expect(hostOf('nope')).toBe('')
  })
})

describe('looksLikeHtmlPage', () => {
  it('rejects obvious assets', () => {
    for (const v of ['https://a.com/x.png', 'https://a.com/a.pdf', 'https://a.com/s.CSS'])
      expect(looksLikeHtmlPage(v)).toBe(false)
  })
  it('accepts pages and extensionless paths', () => {
    for (const v of ['https://a.com/about', 'https://a.com/a.html', 'https://a.com/'])
      expect(looksLikeHtmlPage(v)).toBe(true)
  })
})

describe('browserRestrictionReason', () => {
  it('flags the Chrome Web Store, which Chrome will not let an extension request', () => {
    // Seen in the wild on google.com/chrome: four "broken" links, all of them
    // Google's own Web Store links, all of them perfectly alive.
    for (const url of [
      'https://chromewebstore.google.com/category/extensions',
      'https://chromewebstore.google.com/?hl=en',
      'https://chrome.google.com/webstore/category/extensions',
    ]) {
      expect(browserRestrictionReason(url), url).toMatch(/Chrome blocks extensions/)
    }
  })
  it('leaves the rest of chrome.google.com alone', () => {
    expect(browserRestrictionReason('https://chrome.google.com/')).toBeNull()
  })
  it('flags the other extension stores too', () => {
    expect(browserRestrictionReason('https://addons.mozilla.org/firefox/')).not.toBeNull()
    expect(browserRestrictionReason('https://microsoftedge.microsoft.com/addons/detail/x')).not.toBeNull()
  })
  it('says nothing about an ordinary url', () => {
    expect(browserRestrictionReason('https://example.com/a')).toBeNull()
    expect(browserRestrictionReason('not a url')).toBeNull()
  })
  it('is case-insensitive about the host', () => {
    expect(browserRestrictionReason('https://ChromeWebStore.Google.com/x')).not.toBeNull()
  })
})
