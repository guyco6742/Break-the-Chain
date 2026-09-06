/**
 * In-page anchor resolution, shared by the two places that need it: the content
 * script (a live DOM) and the offscreen parser (HTML fetched during a crawl).
 *
 * It lived only in the content script before, which meant a crawl reported every
 * "#section" link on every page as broken — the crawler had no way to answer the
 * question, so it answered "no".
 */

/**
 * Markdown renderers — GitHub, GitLab, Gitea and many static site generators —
 * run heading ids through a sanitiser that prefixes them with `user-content-`,
 * while the permalink they emit still points at the bare id and a small script
 * bridges the two at click time. Taken literally, every heading permalink on
 * GitHub is a dead anchor; taken sensibly, none of them are.
 */
const SANITISER_PREFIXES = ['user-content-']

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
  const candidates = new Set([id, ...SANITISER_PREFIXES.map((prefix) => prefix + id)])

  const byId = (root as ParentNode & { getElementById?: (v: string) => Element | null }).getElementById
  if (typeof byId === 'function') {
    for (const candidate of candidates) if (byId.call(root, candidate)) return true
  }

  for (const el of Array.from(root.querySelectorAll('[id], [name]'))) {
    const elementId = el.getAttribute('id')
    const elementName = el.getAttribute('name')
    if ((elementId && candidates.has(elementId)) || (elementName && candidates.has(elementName))) {
      return true
    }
  }
  return false
}
