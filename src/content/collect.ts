import type { CollectedRef } from '../core/messages.js'
import type { ResourceKind } from '../core/types.js'
import type { Settings } from '../core/settings.js'
import { isInPageAnchor } from '../core/url.js'
import { anchorExistsIn } from '../core/anchors.js'

export const ID_ATTR = 'data-btc-id'

/** Elements touched between yields. Small enough to stay under a frame budget. */
const BATCH = 150

export interface Collected {
  refs: CollectedRef[]
  /**
   * elementId -> element, built during the walk.
   *
   * Results arrive one at a time and each one has to find its element again.
   * Re-querying the document (and every shadow root inside it) per result is
   * O(results x DOM), which on a big page costs far more than the walk itself.
   */
  elements: Map<string, Element>
}

/**
 * Hands control back to the browser so it can paint.
 *
 * `scheduler.yield()` is the right tool where it exists. The fallback is
 * `requestAnimationFrame` only while the tab is visible: a hidden tab never
 * fires it, and collection would simply stop halfway if the user switched tabs
 * mid-scan. `setTimeout` keeps running there, throttled but alive.
 */
async function yieldToBrowser(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler
  if (typeof scheduler?.yield === 'function') return scheduler.yield()
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
    return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
  return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

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
export async function collectRefs(settings: Settings): Promise<Collected> {
  const refs: CollectedRef[] = []
  const elements = new Map<string, Element>()
  let counter = 0
  let sinceYield = 0
  const seenRoots = new Set<DocumentOrShadowRoot>()

  const walk = async (root: Document | ShadowRoot, depth: number): Promise<void> => {
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
        // Writing an attribute to every link on a big page in one uninterrupted
        // loop freezes the tab: no scrolling, no clicks, until it finishes.
        if (++sinceYield >= BATCH) {
          sinceYield = 0
          await yieldToBrowser()
        }
        const raw = el.getAttribute(target.attr) ?? ''
        const id = `e${++counter}`
        el.setAttribute(ID_ATTR, id)
        elements.set(id, el)
        refs.push({
          elementId: id,
          raw,
          kind: target.kind,
          text: labelFor(el, target.kind),
          excludedBySelector: excluded.has(el) || undefined,
          anchorFound:
            settings.checkAnchors && isInPageAnchor(raw) ? anchorExistsIn(root, raw) : undefined,
        })
      }
    }

    if (!settings.deepScan) return

    for (const el of Array.from(root.querySelectorAll('*'))) {
      const shadow = (el as Element & { shadowRoot: ShadowRoot | null }).shadowRoot
      if (shadow) await walk(shadow, depth + 1)
    }
    for (const frame of Array.from(root.querySelectorAll('iframe'))) {
      const doc = sameOriginDocument(frame as HTMLIFrameElement)
      if (doc) await walk(doc, depth + 1)
    }
  }

  await walk(document, 0)
  return { refs, elements }
}

/** Cross-origin frames throw on access; that's expected, not an error. */
function sameOriginDocument(frame: HTMLIFrameElement): Document | null {
  try {
    return frame.contentDocument ?? null
  } catch {
    return null
  }
}

function labelFor(el: Element, kind: ResourceKind): string {
  if (kind === 'image') return (el.getAttribute('alt') || el.getAttribute('title') || '').trim().slice(0, 200)
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  if (text) return text.slice(0, 200)
  const img = el.querySelector('img')
  if (img) return (img.getAttribute('alt') || '[image]').slice(0, 200)
  return (el.getAttribute('title') || el.getAttribute('aria-label') || '').trim().slice(0, 200)
}

/**
 * Fallback lookup for ids the collected map does not have — for instance a
 * result that arrives after the page replaced part of its DOM. The map from
 * collectRefs is the fast path; this walks.
 */
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
