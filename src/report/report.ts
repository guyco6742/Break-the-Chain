import type { LinkRecord, LinkCategory, ScanState } from '../core/types.js'
import { toCsv, toJson, suggestFilename } from '../core/exporter.js'
import { statusChip, statusLabel } from '../core/classify.js'
import { DEFAULT_SETTINGS } from '../core/settings.js'

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

const COLORS: Record<LinkCategory, string> = {
  valid: DEFAULT_SETTINGS.colors.valid,
  redirect: DEFAULT_SETTINGS.colors.redirect,
  warning: DEFAULT_SETTINGS.colors.warning,
  invalid: DEFAULT_SETTINGS.colors.invalid,
  empty: DEFAULT_SETTINGS.colors.warning,
  excluded: DEFAULT_SETTINGS.colors.excluded,
  skipped: '#4b5563',
  pending: '#4b5563',
}

let state: ScanState | null = null
let category: LinkCategory | 'all' = 'all'
let search = ''
let hopsOnly = false
let sortKey: keyof LinkRecord = 'status'
let sortDir: 1 | -1 = -1

async function load(): Promise<void> {
  const res = (await chrome.runtime.sendMessage({ type: 'GET_STATE' })) as { state: ScanState | null }
  state = res?.state ?? null
  if (!state) return
  $('empty').hidden = true
  const when = new Date(state.startedAt).toLocaleString()
  $('meta').textContent =
    `${state.origin} · ${state.mode === 'site' ? `${state.pagesCrawled} ${state.pagesCrawled === 1 ? 'page' : 'pages'} crawled` : 'single page'} · ` +
    `${state.totals.total} references · ${state.totals.invalid} broken · ${when}`
  render()
}

function visible(): LinkRecord[] {
  if (!state) return []
  const q = search.trim().toLowerCase()
  const rows = state.results.filter((r) => {
    if (category !== 'all' && r.category !== category) return false
    if (hopsOnly && r.redirects.length === 0) return false
    if (!q) return true
    return (
      r.url.toLowerCase().includes(q) ||
      r.text.toLowerCase().includes(q) ||
      String(r.status ?? '').includes(q) ||
      r.category.includes(q)
    )
  })
  return rows.sort((a, b) => {
    const av = a[sortKey]
    const bv = b[sortKey]
    if (typeof av === 'number' || typeof bv === 'number') {
      return (((av as number) ?? -1) - ((bv as number) ?? -1)) * sortDir
    }
    return String(av ?? '').localeCompare(String(bv ?? '')) * sortDir
  })
}

function render(): void {
  renderChips()
  const rows = visible()
  const tbody = $('rows')
  tbody.innerHTML = ''

  for (const r of rows) {
    const tr = document.createElement('tr')

    const status = document.createElement('td')
    const code = document.createElement('span')
    code.className = 'code'
    code.style.background = COLORS[r.category]
    code.textContent = statusChip(r.status, r.category)
    code.title = statusLabel(r.status, r.category)
    status.appendChild(code)

    const url = document.createElement('td')
    url.className = 'url'
    if (r.url.startsWith('http')) {
      const a = document.createElement('a')
      a.href = r.url
      a.target = '_blank'
      a.rel = 'noreferrer'
      a.textContent = r.url
      url.appendChild(a)
    } else {
      url.textContent = r.raw || r.url
    }
    if (r.redirects.length > 0) {
      const list = document.createElement('ul')
      list.className = 'hops'
      for (const hop of r.redirects) {
        const li = document.createElement('li')
        li.textContent = `${hop.status} → ${hop.to}`
        list.appendChild(li)
      }
      if (r.redirectLoop) {
        const li = document.createElement('li')
        li.className = 'loop'
        li.textContent = '⟲ redirect loop'
        list.appendChild(li)
      }
      url.appendChild(list)
    }
    if (r.error) {
      const err = document.createElement('div')
      err.className = 'err'
      err.textContent = r.error
      url.appendChild(err)
    }
    if (r.note) {
      const note = document.createElement('div')
      note.className = 'note'
      note.textContent = r.note
      url.appendChild(note)
    }

    const text = document.createElement('td')
    text.className = 'text'
    text.textContent = r.text

    const kind = document.createElement('td')
    kind.textContent = r.kind

    const occ = document.createElement('td')
    occ.textContent = String(r.occurrences)

    const ms = document.createElement('td')
    ms.textContent = r.durationMs === null ? '' : String(r.durationMs)

    const found = document.createElement('td')
    found.className = 'found'
    found.textContent = r.foundOn

    tr.append(status, url, text, kind, occ, ms, found)
    tbody.appendChild(tr)
  }

  $('empty').hidden = rows.length > 0
  if (rows.length === 0) $('empty').textContent = state ? 'Nothing matches this filter.' : 'No scan data yet.'
}

function renderChips(): void {
  const chips = $('chips')
  chips.innerHTML = ''
  if (!state) return
  const counts = new Map<LinkCategory, number>()
  for (const r of state.results) counts.set(r.category, (counts.get(r.category) ?? 0) + 1)

  const add = (value: LinkCategory | 'all', label: string, count: number, color: string): void => {
    const b = document.createElement('button')
    b.className = 'chip'
    b.setAttribute('aria-pressed', String(category === value))
    b.innerHTML = `<span class="dot" style="background:${color}"></span>${label} ${count}`
    b.addEventListener('click', () => {
      category = value
      render()
    })
    chips.appendChild(b)
  }

  add('all', 'all', state.results.length, '#8a94a6')
  for (const [cat, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    add(cat, cat, n, COLORS[cat])
  }
}

function download(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

$('csv').addEventListener('click', () => {
  if (!state) return
  download(toCsv(visible()), suggestFilename(state.origin, 'csv'), 'text/csv;charset=utf-8')
})
$('json').addEventListener('click', () => {
  if (!state) return
  const meta = { scannedUrl: state.origin, mode: state.mode, totals: state.totals }
  download(toJson(visible(), meta), suggestFilename(state.origin, 'json'), 'application/json')
})
$<HTMLInputElement>('search').addEventListener('input', (e) => {
  search = (e.target as HTMLInputElement).value
  render()
})
$<HTMLInputElement>('only-hops').addEventListener('change', (e) => {
  hopsOnly = (e.target as HTMLInputElement).checked
  render()
})
for (const th of Array.from(document.querySelectorAll('th[data-sort]'))) {
  th.addEventListener('click', () => {
    const key = th.getAttribute('data-sort') as keyof LinkRecord
    sortDir = key === sortKey ? ((sortDir * -1) as 1 | -1) : -1
    sortKey = key
    render()
  })
}

void load()
