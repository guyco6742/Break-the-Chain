import { loadSettings, saveSettings, DEFAULT_SETTINGS, type Settings } from '../core/settings.js'
import type { LinkRecord, LinkCategory } from '../core/types.js'
import type { ScanProgress, ToContent } from '../core/messages.js'
import { collectRefs, findElements, ID_ATTR } from './collect.js'
import { PANEL_CSS, pageCss } from './panel-css.js'

declare global {
  interface Window { __btcInjected?: boolean }
}

const HOST_ID = 'break-the-chain-panel'
const HIGHLIGHT_STYLE_ID = 'break-the-chain-style'
const VISIBLE: LinkCategory[] = ['invalid', 'warning', 'redirect', 'empty', 'valid']

let settings: Settings = DEFAULT_SETTINGS
const records = new Map<string, LinkRecord>()
let filter: LinkCategory | 'all' = 'invalid'
let panel: Panel | null = null

if (!window.__btcInjected) {
  window.__btcInjected = true
  chrome.runtime.onMessage.addListener((raw) => {
    handle(raw as ToContent)
    return undefined
  })
}

async function handle(msg: ToContent): Promise<void> {
  switch (msg.type) {
    case 'SCAN_STARTED':
      settings = await loadSettings()
      records.clear()
      injectPageCss()
      panel ??= new Panel()
      panel.reset()
      break
    case 'COLLECT': {
      settings = await loadSettings()
      const refs = collectRefs(settings)
      await chrome.runtime.sendMessage({ type: 'PAGE_REFS', refs, pageUrl: location.href })
      break
    }
    case 'RESULT':
      records.set(msg.record.id, msg.record)
      paint(msg.record, msg.elementIds)
      panel?.render()
      break
    case 'PROGRESS':
    case 'SCAN_DONE':
      panel?.setProgress(msg.progress, msg.type === 'SCAN_DONE')
      break
    case 'CLEAR_HIGHLIGHTS':
      clearAll()
      break
  }
}

function paint(record: LinkRecord, elementIds: string[]): void {
  if (record.category === 'skipped') return
  for (const el of findElements(elementIds)) {
    el.setAttribute('data-btc-cat', record.category)
    if (record.status !== null) el.setAttribute('data-btc-status', String(record.status))
    else if (record.category === 'empty') el.setAttribute('data-btc-status', 'empty')
    else if (record.error) el.setAttribute('data-btc-status', 'ERR')
  }
}

function injectPageCss(): void {
  document.getElementById(HIGHLIGHT_STYLE_ID)?.remove()
  const style = document.createElement('style')
  style.id = HIGHLIGHT_STYLE_ID
  style.textContent = pageCss(settings.colors, settings.showBadges)
  document.documentElement.appendChild(style)
}

function clearAll(): void {
  document.getElementById(HIGHLIGHT_STYLE_ID)?.remove()
  document.getElementById(HOST_ID)?.remove()
  panel = null
  records.clear()
  for (const el of Array.from(document.querySelectorAll(`[${ID_ATTR}]`))) {
    el.removeAttribute(ID_ATTR)
    el.removeAttribute('data-btc-cat')
    el.removeAttribute('data-btc-status')
  }
}

/** The floating results panel. Lives in a shadow root so page CSS can't touch it. */
class Panel {
  private readonly root: ShadowRoot
  private readonly wrap: HTMLDivElement
  private readonly list: HTMLDivElement
  private readonly chips: HTMLDivElement
  private readonly bar: HTMLElement
  private readonly title: HTMLSpanElement
  private readonly cornerBtn: HTMLButtonElement
  private readonly recheck: HTMLButtonElement
  private readonly stop: HTMLButtonElement
  private minimized = false

  constructor() {
    document.getElementById(HOST_ID)?.remove()
    const host = document.createElement('div')
    host.id = HOST_ID
    document.documentElement.appendChild(host)
    this.root = host.attachShadow({ mode: 'open' })

    const style = document.createElement('style')
    style.textContent = PANEL_CSS
    this.root.appendChild(style)

    this.wrap = document.createElement('div')
    this.wrap.className = 'wrap'
    this.root.appendChild(this.wrap)

    const hdr = document.createElement('div')
    hdr.className = 'hdr'
    this.title = document.createElement('span')
    this.title.className = 'name'
    this.title.textContent = 'Break the Chain'
    hdr.appendChild(this.title)
    this.cornerBtn = this.iconButton('', 'Move to the next corner', () => void this.cycleCorner())
    this.cornerBtn.classList.add('corner')
    hdr.appendChild(this.cornerBtn)
    hdr.appendChild(this.iconButton('–', 'Minimize', () => this.toggleMinimize()))
    hdr.appendChild(this.iconButton('×', 'Close', () => clearAll()))
    this.wrap.appendChild(hdr)
    this.makeDraggable(hdr)

    this.bar = document.createElement('div')
    this.bar.className = 'bar'
    this.bar.innerHTML = '<i></i>'
    this.wrap.appendChild(this.bar)

    this.chips = document.createElement('div')
    this.chips.className = 'chips'
    this.wrap.appendChild(this.chips)

    this.list = document.createElement('div')
    this.list.className = 'list'
    this.wrap.appendChild(this.list)

    const ftr = document.createElement('div')
    ftr.className = 'ftr'
    this.recheck = this.textButton('Re-check failures', () =>
      chrome.runtime.sendMessage({ type: 'RECHECK_BROKEN' }),
    )
    this.stop = this.textButton('Stop', () => chrome.runtime.sendMessage({ type: 'STOP_SCAN' }))
    ftr.appendChild(this.textButton('Full report', () => chrome.runtime.sendMessage({ type: 'OPEN_REPORT' })))
    ftr.appendChild(this.recheck)
    ftr.appendChild(this.stop)
    this.wrap.appendChild(ftr)

    this.place()
    this.render()
  }

  reset(): void {
    this.list.innerHTML = ''
    this.render()
  }

  setProgress(p: ScanProgress, done: boolean): void {
    const pct = p.totals.total === 0 ? 0 : Math.round((p.totals.checked / p.totals.total) * 100)
    ;(this.bar.firstElementChild as HTMLElement).style.width = `${pct}%`
    const pages = p.mode === 'site' ? ` · ${p.pagesCrawled} pages` : ''
    this.title.textContent = done
      ? `Break the Chain — done (${p.totals.total} refs${pages})`
      : `Break the Chain — ${p.totals.checked}/${p.totals.total}${pages}`
    this.stop.disabled = done
    this.recheck.disabled = !done || p.totals.invalid + p.totals.warning === 0
    this.render()
  }

  render(): void {
    const counts = new Map<LinkCategory, number>()
    for (const r of records.values()) counts.set(r.category, (counts.get(r.category) ?? 0) + 1)

    this.chips.innerHTML = ''
    this.chips.appendChild(this.chip('all', 'All', records.size, '#8a94a6'))
    for (const cat of VISIBLE) {
      const n = counts.get(cat) ?? 0
      if (n === 0 && cat !== 'invalid') continue
      this.chips.appendChild(this.chip(cat, cat, n, this.colorFor(cat)))
    }

    const rows = [...records.values()]
      .filter((r) => (filter === 'all' ? r.category !== 'skipped' : r.category === filter))
      .sort((a, b) => (b.status ?? 999) - (a.status ?? 999))
      .slice(0, 300)

    this.list.innerHTML = ''
    if (rows.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'empty'
      empty.textContent = filter === 'invalid' ? 'No broken links found.' : 'Nothing in this group.'
      this.list.appendChild(empty)
      return
    }
    for (const r of rows) this.list.appendChild(this.row(r))
  }

  private row(r: LinkRecord): HTMLElement {
    const row = document.createElement('div')
    row.className = 'row'
    const top = document.createElement('div')
    top.className = 'top'
    const code = document.createElement('span')
    code.className = 'code'
    code.style.background = this.colorFor(r.category)
    code.textContent = r.status !== null ? String(r.status) : r.category === 'empty' ? 'empty' : 'ERR'
    const txt = document.createElement('span')
    txt.className = 'txt'
    txt.textContent = r.text || r.raw || r.url
    top.append(code, txt)
    const url = document.createElement('span')
    url.className = 'url'
    url.textContent =
      r.redirects.length > 0 ? `${r.url}  →  ${r.finalUrl ?? ''} (${r.redirects.length} hops)` : r.url
    row.append(top, url)
    row.title = r.note ?? r.error ?? r.url
    row.addEventListener('click', () => this.reveal(r))
    return row
  }

  private reveal(r: LinkRecord): void {
    const el = findElements([r.id]).at(0) ?? this.elementForRecord(r)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.setAttribute('data-btc-flash', '1')
    setTimeout(() => el.removeAttribute('data-btc-flash'), 2400)
  }

  private elementForRecord(r: LinkRecord): Element | null {
    const value = r.raw.replace(/["\\]/g, '\\$&')
    try {
      return document.querySelector(`[href="${value}"], [src="${value}"]`)
    } catch {
      return null
    }
  }

  private chip(value: LinkCategory | 'all', label: string, count: number, color: string): HTMLElement {
    const chip = document.createElement('button')
    chip.className = 'chip'
    chip.setAttribute('aria-pressed', String(filter === value))
    chip.innerHTML = `<span class="dot" style="background:${color}"></span>${label} ${count}`
    chip.addEventListener('click', () => {
      filter = value
      this.render()
    })
    return chip
  }

  private colorFor(cat: LinkCategory): string {
    const c = settings.colors
    return cat === 'valid' ? c.valid
      : cat === 'redirect' ? c.redirect
      : cat === 'warning' || cat === 'empty' ? c.warning
      : cat === 'invalid' ? c.invalid
      : c.excluded
  }

  private iconButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button')
    b.textContent = label
    b.title = title
    b.addEventListener('click', onClick)
    return b
  }

  private textButton(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button')
    b.textContent = label
    b.addEventListener('click', () => void onClick())
    return b
  }

  private toggleMinimize(): void {
    this.minimized = !this.minimized
    this.wrap.classList.toggle('min', this.minimized)
  }

  /**
   * Always clears all four offsets first. Setting only two of them leaves
   * whatever the previous corner set in place, which is how a panel ends up
   * pinned to two opposite edges at once.
   */
  private place(): void {
    // A filled quadrant is a picture of where the panel is, so the button says
    // both "this is your corner" and "click to go to the next one". An arrow
    // glyph here read as maximise, which is not what it does.
    const QUADRANT = {
      'top-left': '\u2598',
      'top-right': '\u259D',
      'bottom-left': '\u2596',
      'bottom-right': '\u2597',
    } as const
    if (this.cornerBtn) this.cornerBtn.textContent = QUADRANT[settings.panelCorner]

    const style = this.wrap.style
    style.top = style.bottom = style.left = style.right = 'auto'

    if (settings.panelPos) {
      const { left, top } = this.clampToViewport(settings.panelPos.left, settings.panelPos.top)
      style.left = `${left}px`
      style.top = `${top}px`
      return
    }
    const [vertical, horizontal] = settings.panelCorner.split('-')
    style[vertical === 'top' ? 'top' : 'bottom'] = '16px'
    style[horizontal === 'left' ? 'left' : 'right'] = '16px'
  }

  private async cycleCorner(): Promise<void> {
    const corners = ['bottom-right', 'bottom-left', 'top-left', 'top-right'] as const
    const next = corners[(corners.indexOf(settings.panelCorner) + 1) % corners.length]
    settings = { ...settings, panelCorner: next, panelPos: null }
    this.place()
    await saveSettings({ panelCorner: next, panelPos: null })
  }

  /** Keeps a remembered position usable after the window is resized smaller. */
  private clampToViewport(left: number, top: number): { left: number; top: number } {
    const width = this.wrap.offsetWidth || 340
    return {
      left: Math.min(Math.max(left, 0), Math.max(window.innerWidth - width, 0)),
      top: Math.min(Math.max(top, 0), Math.max(window.innerHeight - 60, 0)),
    }
  }

  private makeDraggable(handle: HTMLElement): void {
    let startX = 0
    let startY = 0
    let baseLeft = 0
    let baseTop = 0

    const move = (e: PointerEvent): void => {
      this.wrap.style.left = `${baseLeft + e.clientX - startX}px`
      this.wrap.style.top = `${baseTop + e.clientY - startY}px`
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const rect = this.wrap.getBoundingClientRect()
      const pos = { left: Math.round(rect.left), top: Math.round(rect.top) }
      settings = { ...settings, panelPos: pos }
      void saveSettings({ panelPos: pos })
    }
    handle.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') return
      const rect = this.wrap.getBoundingClientRect()
      this.wrap.style.right = 'auto'
      this.wrap.style.bottom = 'auto'
      this.wrap.style.left = `${rect.left}px`
      this.wrap.style.top = `${rect.top}px`
      startX = e.clientX
      startY = e.clientY
      baseLeft = rect.left
      baseTop = rect.top
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    })
  }
}
