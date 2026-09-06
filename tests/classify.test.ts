import { describe, it, expect } from 'vitest'
import { classifyStatus, isBroken, statusLabel, statusNote } from '../src/core/classify.js'

describe('classifyStatus', () => {
  it('maps 2xx to valid', () => {
    for (const s of [200, 201, 204, 299]) expect(classifyStatus(s)).toBe('valid')
  })
  it('maps 3xx to redirect', () => {
    for (const s of [301, 302, 307, 308]) expect(classifyStatus(s)).toBe('redirect')
  })
  it('treats auth and rate-limit codes as warnings, not breakage', () => {
    for (const s of [401, 403, 429]) expect(classifyStatus(s)).toBe('warning')
  })
  it('maps other 4xx/5xx to invalid', () => {
    for (const s of [400, 404, 410, 500, 503]) expect(classifyStatus(s)).toBe('invalid')
  })
  it('only invalid counts as broken', () => {
    expect(isBroken('invalid')).toBe(true)
    expect(isBroken('warning')).toBe(false)
    expect(isBroken('redirect')).toBe(false)
  })
})

describe('statusLabel', () => {
  it('labels known codes', () => expect(statusLabel(404)).toBe('Not Found'))
  it('falls back for unknown codes', () => expect(statusLabel(499, 'Unknown')).toBe('Unknown'))
  it('handles null', () => expect(statusLabel(null, 'n/a')).toBe('n/a'))
})

describe('statusNote', () => {
  it('explains a 403 as bot protection rather than a broken link', () => {
    const note = statusNote(403, 'https://www.etsy.com/shop/X')
    expect(note).toMatch(/automated requests/i)
    expect(note).toMatch(/not necessarily a broken link/i)
  })
  it('explains 401 as an auth wall', () => {
    expect(statusNote(401, null)).toMatch(/sign-in/i)
  })
  it('points a 429 at the exact settings fields, by their real labels', () => {
    const note = statusNote(429, null)!
    expect(note).toContain('Parallel per host')
    expect(note).toContain('Delay per host (ms)')
    expect(note).toContain('Speed & politeness')
  })
  it('names the site in the LinkedIn-style 999 note', () => {
    expect(statusNote(999, 'https://linkedin.com/x')).toContain('linkedin.com')
  })
  it('says nothing for ordinary statuses', () => {
    for (const s of [200, 301, 404, 500, null]) expect(statusNote(s, null)).toBeNull()
  })
})

describe('note wording matches the settings UI', () => {
  it('every settings label a note points at really exists on the options page', async () => {
    const { readFileSync } = await import('node:fs')
    const html = readFileSync(new URL('../src/options/options.html', import.meta.url), 'utf8')
    for (const label of ['Parallel per host', 'Delay per host (ms)', 'Speed &amp; politeness', 'Exclusions']) {
      expect(html).toContain(label)
    }
  })
})
