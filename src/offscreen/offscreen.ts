/**
 * The MV3 service worker has no DOM, so fetched HTML is parsed here, in an
 * offscreen document, with a real DOMParser. Regex-scraping <a href> out of
 * arbitrary page HTML is how crawlers end up following links inside comments
 * and <script> strings.
 */
export interface ParsedRef {
  raw: string
  text: string
  kind: 'link' | 'image' | 'script' | 'stylesheet'
}

interface ParseRequest {
  target: 'offscreen'
  type: 'PARSE_HTML'
  html: string
  want: { images: boolean; scripts: boolean; stylesheets: boolean }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const msg = message as ParseRequest
  if (!msg || msg.target !== 'offscreen' || msg.type !== 'PARSE_HTML') return undefined
  sendResponse({ refs: parse(msg.html, msg.want) })
  return true
})

function parse(html: string, want: ParseRequest['want']): ParsedRef[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const refs: ParsedRef[] = []

  for (const a of Array.from(doc.querySelectorAll('a[href], area[href]'))) {
    refs.push({
      raw: a.getAttribute('href') ?? '',
      text: (a.textContent ?? '').trim().slice(0, 200),
      kind: 'link',
    })
  }
  if (want.images) {
    for (const img of Array.from(doc.querySelectorAll('img[src]'))) {
      refs.push({
        raw: img.getAttribute('src') ?? '',
        text: img.getAttribute('alt')?.trim().slice(0, 200) ?? '',
        kind: 'image',
      })
    }
  }
  if (want.scripts) {
    for (const s of Array.from(doc.querySelectorAll('script[src]'))) {
      refs.push({ raw: s.getAttribute('src') ?? '', text: '', kind: 'script' })
    }
  }
  if (want.stylesheets) {
    for (const l of Array.from(doc.querySelectorAll('link[rel~="stylesheet"][href]'))) {
      refs.push({ raw: l.getAttribute('href') ?? '', text: '', kind: 'stylesheet' })
    }
  }
  return refs
}
