import { describe, it, expect } from 'vitest'
import { parseRobots, isAllowed } from '../src/core/robots.js'

const SAMPLE = `
# comment
User-agent: *
Disallow: /private/
Disallow: /tmp
Allow: /private/public-page
Crawl-delay: 2
Sitemap: https://a.com/sitemap.xml

User-agent: EvilBot
Disallow: /
`

describe('parseRobots', () => {
  it('picks the * group and ignores other agents', () => {
    const r = parseRobots(SAMPLE)
    expect(r.disallow).toEqual(['/private/', '/tmp'])
    expect(r.allow).toEqual(['/private/public-page'])
  })
  it('reads crawl-delay in ms and collects sitemaps globally', () => {
    const r = parseRobots(SAMPLE)
    expect(r.crawlDelayMs).toBe(2000)
    expect(r.sitemaps).toEqual(['https://a.com/sitemap.xml'])
  })
  it('is permissive on an empty file', () => {
    const r = parseRobots('')
    expect(isAllowed(r, 'https://a.com/anything')).toBe(true)
  })
})

describe('isAllowed', () => {
  const r = parseRobots(SAMPLE)
  it('blocks disallowed paths', () => {
    expect(isAllowed(r, 'https://a.com/private/secret')).toBe(false)
    expect(isAllowed(r, 'https://a.com/tmp/x')).toBe(false)
  })
  it('allows everything else', () => {
    expect(isAllowed(r, 'https://a.com/about')).toBe(true)
  })
  it('gives the longest match priority', () => {
    expect(isAllowed(r, 'https://a.com/private/public-page')).toBe(true)
  })
  it('supports * wildcards and $ anchors', () => {
    const w = parseRobots('User-agent: *\nDisallow: /*.pdf$')
    expect(isAllowed(w, 'https://a.com/a/b.pdf')).toBe(false)
    expect(isAllowed(w, 'https://a.com/a/b.pdf?x=1')).toBe(true)
  })
})
