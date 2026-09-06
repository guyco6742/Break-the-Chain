// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { anchorExistsIn, anchorId, isDocumentTopAnchor } from '../src/core/anchors.js'

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('isDocumentTopAnchor', () => {
  it('treats #, #top and #TOP as the top of the document', () => {
    for (const v of ['#', '#top', '#TOP', '#Top']) expect(isDocumentTopAnchor(v)).toBe(true)
  })
  it('does not treat a normal section as the top', () => {
    expect(isDocumentTopAnchor('#topics')).toBe(false)
  })
})

describe('anchorId', () => {
  it('strips the hash and decodes percent-encoding', () => {
    expect(anchorId('#a%20b')).toBe('a b')
    expect(anchorId('#%D7%A2%D7%91%D7%A8%D7%99%D7%AA')).toBe('עברית')
  })
  it('survives malformed encoding instead of throwing', () => {
    expect(anchorId('#100%')).toBe('100%')
  })
})

describe('anchorExistsIn — markdown-renderer permalinks', () => {
  it('accepts a GitHub-style heading permalink', () => {
    // This is what GitHub actually emits for "## What it does".
    document.body.innerHTML =
      '<h2><a id="user-content-what-it-does" class="anchor" href="#what-it-does"></a>What it does</h2>'
    expect(anchorExistsIn(document, '#what-it-does')).toBe(true)
  })
  it('still rejects a permalink whose target really is absent', () => {
    document.body.innerHTML = '<h2><a id="user-content-intro"></a>Intro</h2>'
    expect(anchorExistsIn(document, '#outro')).toBe(false)
  })
  it('does not let the prefix create false matches in reverse', () => {
    document.body.innerHTML = '<div id="intro"></div>'
    expect(anchorExistsIn(document, '#user-content-intro')).toBe(false)
  })
})

describe('anchorExistsIn', () => {
  it('finds an element by id', () => {
    document.body.innerHTML = '<h2 id="pricing">x</h2>'
    expect(anchorExistsIn(document, '#pricing')).toBe(true)
  })
  it('finds a legacy name attribute', () => {
    document.body.innerHTML = '<a name="old"></a>'
    expect(anchorExistsIn(document, '#old')).toBe(true)
  })
  it('reports a missing target', () => {
    document.body.innerHTML = '<h2 id="pricing">x</h2>'
    expect(anchorExistsIn(document, '#nowhere')).toBe(false)
  })
  it('always accepts the document top, even on an empty page', () => {
    expect(anchorExistsIn(document, '#top')).toBe(true)
  })
  it('handles ids that are legal HTML but invalid selector syntax', () => {
    document.body.innerHTML = '<div id="a.b:c/d">x</div>'
    expect(anchorExistsIn(document, '#a.b:c/d')).toBe(true)
  })
  it('is case-sensitive, like the HTML spec', () => {
    document.body.innerHTML = '<h2 id="Pricing">x</h2>'
    expect(anchorExistsIn(document, '#pricing')).toBe(false)
  })
  it('works on a document parsed from a string, as the crawler does', () => {
    const doc = new DOMParser().parseFromString(
      '<html><body><h1 id="intro">hi</h1><a href="#intro">go</a></body></html>',
      'text/html',
    )
    expect(anchorExistsIn(doc, '#intro')).toBe(true)
    expect(anchorExistsIn(doc, '#missing')).toBe(false)
  })
})
