import type { CollectedRef } from '../core/messages.js'
import type { ResourceKind } from '../core/types.js'
import type { Settings } from '../core/settings.js'
import { isInPageAnchor } from '../core/url.js'

export const ID_ATTR = 'data-btc-id'

interface Target {
  selector: string
  attr: string
  kind: ResourceKind
  enabled: (s: Settings) => boolean
}

const TARGETS: Target[] = [
  { selector: 'a[href], area[href]', attr: 'href', kind: 'link', enabled: () => true },
  { selector: 'img[src]', attr: 'src', kind: 'image', enabled: (s) => s.checkImages },
  { selector: 'script[src]', attr: 'src', kind: 'script', enabled: (s) => s.checkScripts },
  { selector: 'link[rel~="stylesheet"][href]', attr: 'href', kind: 'stylesheet', enabled: (s) => s.checkStylesheets },
]

/**
 * Collect every checkable reference on the page.
 *
 * `document.querySelectorAll` alone misses two things that modern sites are
 * full of: shadow roots (web components, design systems) and same-origin
 * iframes (embeds, editors). Both are walked recursively here.
 */
export function collectRefs(settings: Settings): CollectedRef[] {
  const refs: CollectedRef[] = []
  let counter = 0
  const seenRoots = new Set<DocumentOrShadowRoot>()

  const walk = (root: Document | ShadowRoot, depth: number): void => {
    if (depth > 8 || seenRoots.has(root)) return
    seenRoots.add(root)

    const excluded = new Set<Element>()
    for (const sel of settings.excludeSelectors) {
      let hosts: Element[] = []
      try {
        hosts = Array.from(root.querySelectorAll(sel))
      } catch {
        continue // invalid selector typed by the user
      }
      for (const host of hosts) for (const el of host.querySelectorAll('*')) excluded.add(el)
    }

    for (const target of TARGETS) {
      if (!target.enabled(settings)) continue
      for (const el of Array.from(root.querySelectorAll(target.selector))) {
        const raw = el.getAttribute(target.attr) ?? ''
        const id = `e${++counter}`
        el.setAttribute(ID_ATTR, id)
        refs.push({
          elementId: id,
          raw,
          kind: target.kind,
          text: labelFor(el, target.kind),
          excludedBySelector: excluded.has(el) || undefined,
          anchorFound:
            settings.checkAnchors && isInPageAnchor(raw) ? anchorExists(root, raw) : undefined,
        })
      }
    }

    if (!settings.deepScan) return

    for (const el of Array.from(root.querySelectorAll('*'))) {
      const shadow = (el as Element & { shadowRoot: ShadowRoot | null }).shadowRoot
      if (shadow) walk(shadow, depth + 1)
    }
    for (const frame of Array.from(root.querySelectorAll('iframe'))) {
      const doc = sameOriginDocument(frame as HTMLIFrameElement)
      if (doc) walk(doc, depth + 1)
    }
  }

  walk(document, 0)
  return refs
}

/** Cross-origin frames throw on access; that's expected, not an error. */
function sameOriginDocument(frame: HTMLIFrameElement): Document | null {
  try {
    return frame.contentDocument ?? null
  } catch {
    return null
  }
}

function anchorExists(root: Document | ShadowRoot, raw: string): boolean {
  const id = decodeURIComponent(raw.slice(1))
  if (!id) return true
  if (id.toLowerCase() === 'top') return true
  const scope = root as ParentNode & { getElementById?: (v: string) => Element | null }
  if (scope.getElementById?.(id)) return true

  // Scanned rather than selected on purpose: ids containing a dot, colon or
  // slash are perfectly legal in HTML but are not valid selector syntax, and
  // CSS.escape is not available in every DOM implementation.
  for (const el of Array.from(root.querySelectorAll('[id], [name]'))) {
    if (el.getAttribute('id') === id || el.getAttribute('name') === id) return true
  }
  return false
}

function labelFor(el: Element, kind: ResourceKind): string {
  if (kind === 'image') return (el.getAttribute('alt') || el.getAttribute('title') || '').trim().slice(0, 200)
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  if (text) return text.slice(0, 200)
  const img = el.querySelector('img')
  if (img) return (img.getAttribute('alt') || '[image]').slice(0, 200)
  return (el.getAttribute('title') || el.getAttribute('aria-label') || '').trim().slice(0, 200)
}

/** Find every element carrying one of the ids, across shadow roots and frames. */
export function findElements(ids: string[]): Element[] {
  const wanted = new Set(ids)
  const found: Element[] = []
  const seen = new Set<DocumentOrShadowRoot>()

  const walk = (root: Document | ShadowRoot, depth: number): void => {
    if (depth > 8 || seen.has(root)) return
    seen.add(root)
    for (const el of Array.from(root.querySelectorAll(`[${ID_ATTR}]`))) {
      if (wanted.has(el.getAttribute(ID_ATTR) ?? '')) found.push(el)
    }
    for (const el of Array.from(root.querySelectorAll('*'))) {
      const shadow = (el as Element & { shadowRoot: ShadowRoot | null }).shadowRoot
      if (shadow) walk(shadow, depth + 1)
    }
    for (const frame of Array.from(root.querySelectorAll('iframe'))) {
      const doc = sameOriginDocument(frame as HTMLIFrameElement)
      if (doc) walk(doc, depth + 1)
    }
  }
  walk(document, 0)
  return found
}
