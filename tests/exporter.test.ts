import { describe, it, expect } from 'vitest'
import { toCsv, toJson, csvCell, suggestFilename } from '../src/core/exporter.js'
import type { LinkRecord } from '../src/core/types.js'

const rec = (over: Partial<LinkRecord> = {}): LinkRecord => ({
  id: '1', url: 'https://a.com/x', raw: '/x', kind: 'link', text: 'Home',
  foundOn: 'https://a.com/', category: 'valid', status: 200, statusText: 'OK',
  finalUrl: 'https://a.com/x', redirects: [], redirectLoop: false,
  contentType: 'text/html', durationMs: 12, error: null, note: null, occurrences: 1,
  checkedAt: 0, ...over,
})

describe('csvCell', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('a\nb')).toBe('"a\nb"')
  })
  it('leaves plain values alone and blanks nullish', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell(null)).toBe('')
  })
})

describe('toCsv', () => {
  it('starts with a BOM and a header row', () => {
    const csv = toCsv([rec()])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv.split('\r\n')[0]).toContain('status,category,url')
  })
  it('flattens the redirect chain into one cell', () => {
    const csv = toCsv([rec({ redirects: [
      { from: 'https://a.com/x', to: 'https://a.com/y', status: 301 },
      { from: 'https://a.com/y', to: 'https://a.com/z', status: 302 },
    ] })])
    expect(csv).toContain('301 -> https://a.com/y | 302 -> https://a.com/z')
  })
  it('escapes anchor text containing a comma', () => {
    expect(toCsv([rec({ text: 'Home, sweet home' })])).toContain('"Home, sweet home"')
  })
})

describe('toJson', () => {
  it('wraps records with metadata', () => {
    const parsed = JSON.parse(toJson([rec()], { scannedUrl: 'https://a.com/' }))
    expect(parsed.generator).toBe('break-the-chain')
    expect(parsed.scannedUrl).toBe('https://a.com/')
    expect(parsed.records).toHaveLength(1)
  })
})

describe('suggestFilename', () => {
  it('includes the host and extension', () => {
    expect(suggestFilename('https://example.com/a', 'csv')).toMatch(/^break-the-chain_example\.com_.*\.csv$/)
  })
  it('survives a junk origin', () => {
    expect(suggestFilename('nope', 'json')).toMatch(/^break-the-chain_scan_.*\.json$/)
  })
})
