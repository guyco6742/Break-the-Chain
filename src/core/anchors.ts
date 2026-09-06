/**
 * In-page anchor resolution, shared by the two places that need it: the content
 * script (a live DOM) and the offscreen parser (HTML fetched during a crawl).
 *
 * It lived only in the content script before, which meant a crawl reported every
 * "#section" link on every page as broken — the crawler had no way to answer the
 * question, so it answered "no".
 */

/** `#`, `#top` and `#TOP` all mean "top of the document" in HTML. */
export function isDocumentTopAnchor(raw: string): boolean {
  const id = anchorId(raw)
  return id === '' || id.toLowerCase() === 'top'
}

/** The decoded id an anchor points at, without the leading "#". */
export function anchorId(raw: string): string {
  const value = raw.trim().replace(/^#/, '')
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * Does anything in this document answer to the anchor?
 *
 * Scanned rather than selected on purpose: ids containing a dot, colon or slash
 * are perfectly legal in HTML but are not valid selector syntax, and CSS.escape
 * is not available in every DOM implementation.
 */
export function anchorExistsIn(root: ParentNode, raw: string): boolean {
  if (isDocumentTopAnchor(raw)) return true
  const id = anchorId(raw)

  const byId = (root as ParentNode & { getElementById?: (v: string) => Element | null }).getElementById
  if (typeof byId === 'function' && byId.call(root, id)) return true

  for (const el of Array.from(root.querySelectorAll('[id], [name]'))) {
    if (el.getAttribute('id') === id || el.getAttribute('name') === id) return true
  }
  return false
}
