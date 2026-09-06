import { describe, it, expect } from 'vitest'
import { compilePattern, compileExcludes } from '../src/core/exclude.js'

describe('compilePattern', () => {
  it('treats a bare token as a substring match', () => {
    const m = compilePattern('facebook.com')!
    expect(m('https://www.facebook.com/x')).toBe(true)
    expect(m('https://twitter.com/x')).toBe(false)
  })
  it('is case-insensitive for substrings', () => {
    expect(compilePattern('FaceBook')!('https://facebook.com')).toBe(true)
  })
  it('supports * globs anchored to the whole url', () => {
    const m = compilePattern('*/wp-admin/*')!
    expect(m('https://a.com/wp-admin/edit.php')).toBe(true)
    expect(m('https://a.com/admin/edit.php')).toBe(false)
  })
  it('supports regex syntax with flags', () => {
    const m = compilePattern('/\\.pdf($|\\?)/i')!
    expect(m('https://a.com/f.PDF')).toBe(true)
    expect(m('https://a.com/f.pdf?x=1')).toBe(true)
    expect(m('https://a.com/pdf-guide')).toBe(false)
  })
  it('returns null for empty or invalid patterns', () => {
    expect(compilePattern('   ')).toBeNull()
    expect(compilePattern('/[unclosed/')).toBeNull()
  })
})

describe('compileExcludes', () => {
  it('never matches when the list is empty', () => {
    expect(compileExcludes([])('https://a.com')).toBe(false)
  })
  it('matches if any pattern matches, ignoring broken ones', () => {
    const m = compileExcludes(['/[bad/', 'linkedin.com', '*/assets/*'])
    expect(m('https://linkedin.com/in/x')).toBe(true)
    expect(m('https://a.com/assets/logo.svg')).toBe(true)
    expect(m('https://a.com/about')).toBe(false)
  })
})
