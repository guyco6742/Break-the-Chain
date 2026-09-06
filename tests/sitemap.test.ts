import { describe, it, expect } from 'vitest'
import { parseSitemap } from '../src/core/sitemap.js'

describe('parseSitemap', () => {
  it('reads a urlset', () => {
    const r = parseSitemap(`<?xml version="1.0"?><urlset>
      <url><loc>https://a.com/</loc></url>
      <url><loc>https://a.com/about</loc><lastmod>2026-01-01</lastmod></url>
    </urlset>`)
    expect(r.urls).toEqual(['https://a.com/', 'https://a.com/about'])
    expect(r.sitemaps).toEqual([])
  })
  it('reads a sitemap index as nested sitemaps, not pages', () => {
    const r = parseSitemap(`<sitemapindex><sitemap><loc>https://a.com/s1.xml</loc></sitemap></sitemapindex>`)
    expect(r.sitemaps).toEqual(['https://a.com/s1.xml'])
    expect(r.urls).toEqual([])
  })
  it('unwraps CDATA and decodes entities', () => {
    const r = parseSitemap(`<urlset><url><loc><![CDATA[https://a.com/a?x=1&amp;y=2]]></loc></url></urlset>`)
    expect(r.urls).toEqual(['https://a.com/a?x=1&y=2'])
  })
  it('tolerates junk', () => {
    expect(parseSitemap('not xml at all').urls).toEqual([])
  })
})
