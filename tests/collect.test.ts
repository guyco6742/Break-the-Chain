// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { collectRefs, findElements, ID_ATTR } from '../src/content/collect.js'
import { DEFAULT_SETTINGS } from '../src/core/settings.js'

const settings = (over = {}) => ({ ...DEFAULT_SETTINGS, ...over })

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('collectRefs', () => {
  it('collects anchors with their visible text', () => {
    document.body.innerHTML = `<a href="/a">Home</a><a href="https://x.com/b">  Spaced   text </a>`
    const refs = collectRefs(settings())
    expect(refs).toHaveLength(2)
    expect(refs[0]).toMatchObject({ raw: '/a', text: 'Home', kind: 'link' })
    expect(refs[1].text).toBe('Spaced text')
  })

  it('stamps a unique id on every element it collects', () => {
    document.body.innerHTML = `<a href="/a">a</a><a href="/b">b</a>`
    const refs = collectRefs(settings())
    const ids = Array.from(document.querySelectorAll(`[${ID_ATTR}]`)).map((e) => e.getAttribute(ID_ATTR))
    expect(new Set(ids).size).toBe(2)
    expect(ids).toEqual(refs.map((r) => r.elementId))
  })

  it('includes images only when asked', () => {
    document.body.innerHTML = `<img src="/pic.png" alt="Logo">`
    expect(collectRefs(settings({ checkImages: false }))).toHaveLength(0)
    const [ref] = collectRefs(settings({ checkImages: true }))
    expect(ref).toMatchObject({ kind: 'image', text: 'Logo' })
  })

  it('falls back to the inner image alt text for icon links', () => {
    document.body.innerHTML = `<a href="/x"><img src="/i.png" alt="Cart"></a>`
    const link = collectRefs(settings({ checkImages: false }))[0]
    expect(link.text).toBe('Cart')
  })

  it('reaches into shadow roots', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    host.attachShadow({ mode: 'open' }).innerHTML = `<a href="/inside-shadow">deep</a>`
    const refs = collectRefs(settings({ deepScan: true }))
    expect(refs.map((r) => r.raw)).toContain('/inside-shadow')
  })

  it('skips shadow roots when deep scan is off', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    host.attachShadow({ mode: 'open' }).innerHTML = `<a href="/inside-shadow">deep</a>`
    expect(collectRefs(settings({ deepScan: false }))).toHaveLength(0)
  })

  it('resolves in-page anchors against the document', () => {
    document.body.innerHTML = `<h2 id="here">x</h2><a href="#here">good</a><a href="#nowhere">bad</a>`
    const refs = collectRefs(settings())
    expect(refs.find((r) => r.raw === '#here')?.anchorFound).toBe(true)
    expect(refs.find((r) => r.raw === '#nowhere')?.anchorFound).toBe(false)
  })

  it('accepts a legacy name attribute as an anchor target', () => {
    document.body.innerHTML = `<a name="old"></a><a href="#old">jump</a>`
    expect(collectRefs(settings()).find((r) => r.raw === '#old')?.anchorFound).toBe(true)
  })

  it('marks links inside excluded selectors', () => {
    document.body.innerHTML = `<footer><a href="/legal">Legal</a></footer><a href="/main">Main</a>`
    const refs = collectRefs(settings({ excludeSelectors: ['footer'] }))
    expect(refs.find((r) => r.raw === '/legal')?.excludedBySelector).toBe(true)
    expect(refs.find((r) => r.raw === '/main')?.excludedBySelector).toBeUndefined()
  })

  it('ignores an invalid user selector instead of throwing', () => {
    document.body.innerHTML = `<a href="/a">a</a>`
    expect(() => collectRefs(settings({ excludeSelectors: ['>>> bad ('] }))).not.toThrow()
  })

  it('keeps empty hrefs so they can be reported', () => {
    document.body.innerHTML = `<a href="">nothing</a><a href="#">hash</a>`
    expect(collectRefs(settings()).map((r) => r.raw)).toEqual(['', '#'])
  })
})

describe('findElements', () => {
  it('finds stamped elements, including inside shadow roots', () => {
    const host = document.createElement('div')
    document.body.innerHTML = `<a href="/a">a</a>`
    document.body.appendChild(host)
    host.attachShadow({ mode: 'open' }).innerHTML = `<a href="/b">b</a>`
    const refs = collectRefs(settings())
    const found = findElements(refs.map((r) => r.elementId))
    expect(found).toHaveLength(2)
  })

  it('returns nothing for unknown ids', () => {
    document.body.innerHTML = `<a href="/a">a</a>`
    collectRefs(settings())
    expect(findElements(['nope'])).toHaveLength(0)
  })
})
