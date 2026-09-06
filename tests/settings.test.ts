import { describe, it, expect } from 'vitest'
import { mergeSettings, DEFAULT_SETTINGS, SCHEMA_VERSION } from '../src/core/settings.js'

describe('mergeSettings', () => {
  it('returns defaults for undefined', () => {
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  })
  it('keeps unknown-shaped stored data from breaking boot', () => {
    const s = mergeSettings({ concurrency: 2, excludePatterns: 'not an array' })
    expect(s.concurrency).toBe(2)
    expect(s.excludePatterns).toEqual([])
    expect(s.timeoutMs).toBe(DEFAULT_SETTINGS.timeoutMs)
  })
  it('deep-merges colors so a partial palette keeps the rest', () => {
    const s = mergeSettings({ colors: { invalid: '#000' } })
    expect(s.colors.invalid).toBe('#000')
    expect(s.colors.valid).toBe(DEFAULT_SETTINGS.colors.valid)
  })
})

describe('schema upgrades', () => {
  it('overrides a stale panel corner saved before the default moved', () => {
    const s = mergeSettings({ panelCorner: 'top-right', panelPos: { left: 9, top: 9 }, concurrency: 5 })
    expect(s.panelCorner).toBe('bottom-right')
    expect(s.panelPos).toBeNull()
  })
  it('leaves everything else the user configured alone', () => {
    expect(mergeSettings({ panelCorner: 'top-right', concurrency: 5 }).concurrency).toBe(5)
  })
  it('respects a corner the user chose after the upgrade', () => {
    const s = mergeSettings({ schemaVersion: SCHEMA_VERSION, panelCorner: 'top-left' })
    expect(s.panelCorner).toBe('top-left')
  })
  it('keeps a dragged position once the schema is current', () => {
    const pos = { left: 40, top: 120 }
    expect(mergeSettings({ schemaVersion: SCHEMA_VERSION, panelPos: pos }).panelPos).toEqual(pos)
  })
  it('always stamps the current schema version on the way out', () => {
    expect(mergeSettings({}).schemaVersion).toBe(SCHEMA_VERSION)
  })
})
