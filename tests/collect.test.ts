// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { collectRefs, findElements, ID_ATTR } from '../src/content/collect.js'
import { DEFAULT_SETTINGS } from '../src/core/settings.js'

const settings = (over = {}) => ({ ...DEFAULT_SETTINGS, ...over })

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('collectRefs', () => {
  it('collects anchors with their visible text', async () => {
    document.body.innerHTML = `<a href="/a">Home</a><a href="https://x.com/b">  Spaced   text </a>`
    const refs = (await collectRefs(settings())).refs
    expect(refs).toHaveLength(2)
    expect(refs[0]).toMatchObject({ raw: '/a', text: 'Home', kind: 'link' })
    expect(refs[1].text).toBe('Spaced text')
  })

  it('stamps a unique id on every element it collects', async () => {
    document.body.innerHTML = `<a href="/a">a</a><a href="/b">b</a>`
    const refs = (await collectRefs(settings())).refs
    const ids = Array.from(document.querySelectorAll(`[${ID_ATTR}]`)).map((e) => e.getAttribute(ID_ATTR))
    expect(new Set(ids).size).toBe(2)
    expect(ids).toEqual(refs.map((r) => r.elementId))
  })

  it('includes images only when asked', async () => {
    document.body.innerHTML = `<img src="/pic.png" alt="Logo">`
    expect((await collectRefs(settings({ checkImages: false }))).refs).toHaveLength(0)
    const [ref] = (await collectRefs(settings({ checkImages: true }))).refs
    expect(ref).toMatchObject({ kind: 'image', text: 'Logo' })
  })

  it('falls back to the inner image alt text for icon links', async () => {
    document.body.innerHTML = `<a href="/x"><img src="/i.png" alt="Cart"></a>`
    const link = (await collectRefs(settings({ checkImages: false }))).refs[0]
    expect(link.text).toBe('Cart')
  })

  it('reaches into shadow roots', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    host.attachShadow({ mode: 'open' }).innerHTML = `<a href="/inside-shadow">deep</a>`
    const refs = (await collectRefs(settings({ deepScan: true }))).refs
    expect(refs.map((r) => r.raw)).toContain('/inside-shadow')
  })

  it('skips shadow roots when deep scan is off', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    host.attachShadow({ mode: 'open' }).innerHTML = `<a href="/inside-shadow">deep</a>`
    expect((await collectRefs(settings({ deepScan: false }))).refs).toHaveLength(0)
  })

  it('resolves in-page anchors against the document', async () => {
    document.body.innerHTML = `<h2 id="here">x</h2><a href="#here">good</a><a href="#nowhere">bad</a>`
    const refs = (await collectRefs(settings())).refs
    expect(refs.find((r) => r.raw === '#here')?.anchorFound).toBe(true)
    expect(refs.find((r) => r.raw === '#nowhere')?.anchorFound).toBe(false)
  })

  it('accepts a legacy name attribute as an anchor target', async () => {
    document.body.innerHTML = `<a name="old"></a><a href="#old">jump</a>`
    expect((await collectRefs(settings())).refs.find((r) => r.raw === '#old')?.anchorFound).toBe(true)
  })

  it('marks links inside excluded selectors', async () => {
    document.body.innerHTML = `<footer><a href="/legal">Legal</a></footer><a href="/main">Main</a>`
    const refs = (await collectRefs(settings({ excludeSelectors: ['footer'] }))).refs
    expect(refs.find((r) => r.raw === '/legal')?.excludedBySelector).toBe(true)
    expect(refs.find((r) => r.raw === '/main')?.excludedBySelector).toBeUndefined()
  })

  it('ignores an invalid user selector instead of throwing', async () => {
    document.body.innerHTML = `<a href="/a">a</a>`
    await expect(collectRefs(settings({ excludeSelectors: ['>>> bad ('] }))).resolves.toBeDefined()
  })

  it('keeps empty hrefs so they can be reported', async () => {
    document.body.innerHTML = `<a href="">nothing</a><a href="#">hash</a>`
    expect((await collectRefs(settings())).refs.map((r) => r.raw)).toEqual(['', '#'])
  })
})

describe('findElements', () => {
  it('finds stamped elements, including inside shadow roots', async () => {
    const host = document.createElement('div')
    document.body.innerHTML = `<a href="/a">a</a>`
    document.body.appendChild(host)
    host.attachShadow({ mode: 'open' }).innerHTML = `<a href="/b">b</a>`
    const refs = (await collectRefs(settings())).refs
    const found = findElements(refs.map((r) => r.elementId))
    expect(found).toHaveLength(2)
  })

  it('returns nothing for unknown ids', async () => {
    document.body.innerHTML = `<a href="/a">a</a>`
    await collectRefs(settings())
    expect(findElements(['nope'])).toHaveLength(0)
  })
})

describe('collectRefs yields to the browser', () => {
  it('returns the element map alongside the refs', async () => {
    document.body.innerHTML = `<a href="/a">a</a><a href="/b">b</a>`
    const { refs, elements } = await collectRefs(settings())
    expect(elements.size).toBe(refs.length)
    for (const ref of refs) {
      expect(elements.get(ref.elementId)?.getAttribute(ID_ATTR)).toBe(ref.elementId)
    }
  })

  it('gives the main thread a turn on a large page instead of blocking it', async () => {
    document.body.innerHTML = Array.from({ length: 400 }, (_, i) => `<a href="/l${i}">l${i}</a>`).join('')

    // A macrotask queued before collection starts must get to run while it is
    // still going. With a single synchronous loop it could only run afterwards.
    let ranDuringCollection = false
    let finished = false
    const ticker = setInterval(() => {
      if (!finished) ranDuringCollection = true
    }, 0)

    const { refs } = await collectRefs(settings())
    finished = true
    clearInterval(ticker)

    expect(refs).toHaveLength(400)
    expect(ranDuringCollection).toBe(true)
  })
})
