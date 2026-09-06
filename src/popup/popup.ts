import type { ScanProgress } from '../core/messages.js'
import { DEFAULT_SETTINGS } from '../core/settings.js'

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

const els = {
  site: $('site'),
  grant: $<HTMLElement>('grant'),
  grantBtn: $<HTMLButtonElement>('grant-btn'),
  scanPage: $<HTMLButtonElement>('scan-page'),
  scanSite: $<HTMLButtonElement>('scan-site'),
  report: $<HTMLButtonElement>('report'),
  recheck: $<HTMLButtonElement>('recheck'),
  stop: $<HTMLButtonElement>('stop'),
  clear: $<HTMLButtonElement>('clear'),
  status: $('status'),
  totals: $('totals'),
  bar: $('bar'),
  options: $<HTMLButtonElement>('options'),
}

const COLORS: Record<string, string> = {
  valid: DEFAULT_SETTINGS.colors.valid,
  redirect: DEFAULT_SETTINGS.colors.redirect,
  warning: DEFAULT_SETTINGS.colors.warning,
  invalid: DEFAULT_SETTINGS.colors.invalid,
  empty: DEFAULT_SETTINGS.colors.warning,
  excluded: DEFAULT_SETTINGS.colors.excluded,
  skipped: '#4b5563',
}

let tabId: number | null = null
let scannable = false

async function init(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  tabId = tab?.id ?? null
  els.site.textContent = tab?.url ?? ''

  scannable = !!tab?.url && /^https?:/.test(tab.url)
  if (!scannable) {
    els.status.textContent = 'This page can’t be scanned (only http/https pages).'
    els.scanPage.disabled = true
    els.scanSite.disabled = true
  }

  await refreshPermission()
  const res = (await chrome.runtime.sendMessage({ type: 'GET_PROGRESS' })) as { progress: ScanProgress }
  render(res.progress)
}

async function refreshPermission(): Promise<boolean> {
  const granted = await chrome.permissions.contains({ origins: ['<all_urls>'] })
  els.grant.hidden = granted
  return granted
}

els.grantBtn.addEventListener('click', async () => {
  // Must be called straight from the click, or Chrome rejects the request.
  const granted = await chrome.permissions.request({ origins: ['<all_urls>'] })
  if (granted) await refreshPermission()
  else els.status.textContent = 'Permission denied — link checking needs it to run.'
})

els.scanPage.addEventListener('click', () => void start('page'))
els.scanSite.addEventListener('click', () => void start('site'))
els.stop.addEventListener('click', () => void chrome.runtime.sendMessage({ type: 'STOP_SCAN' }))
els.clear.addEventListener('click', () => void chrome.runtime.sendMessage({ type: 'CLEAR' }))
els.recheck.addEventListener('click', () => void chrome.runtime.sendMessage({ type: 'RECHECK_BROKEN' }))
els.report.addEventListener('click', () => void chrome.runtime.sendMessage({ type: 'OPEN_REPORT' }))
els.options.addEventListener('click', () => chrome.runtime.openOptionsPage())

async function start(mode: 'page' | 'site'): Promise<void> {
  if (tabId === null) return
  if (!(await refreshPermission())) {
    els.status.textContent = 'Grant access first.'
    return
  }
  els.status.textContent = mode === 'site' ? 'Crawling…' : 'Scanning…'
  await chrome.runtime.sendMessage({ type: 'START_SCAN', mode, tabId })
}

chrome.runtime.onMessage.addListener((raw) => {
  const msg = raw as { type: string; progress?: ScanProgress }
  if ((msg.type === 'PROGRESS' || msg.type === 'SCAN_DONE') && msg.progress) render(msg.progress)
  return undefined
})

function render(p: ScanProgress): void {
  const { totals } = p
  const pct = totals.total === 0 ? 0 : Math.round((totals.checked / totals.total) * 100)
  els.bar.style.width = `${pct}%`

  els.status.textContent = p.running
    ? p.mode === 'site'
      ? `Crawling — ${p.pagesCrawled} pages, ${totals.checked}/${totals.total} refs checked`
      : `Checking — ${totals.checked}/${totals.total}`
    : totals.total === 0
      ? 'Ready.'
      : `Done — ${totals.total} references, ${totals.invalid} broken.`

  els.totals.innerHTML = ''
  for (const key of ['invalid', 'warning', 'redirect', 'valid', 'empty', 'excluded'] as const) {
    const n = totals[key]
    if (n === 0 && key !== 'invalid') continue
    const li = document.createElement('li')
    li.innerHTML = `<span class="dot" style="background:${COLORS[key]}"></span>${key} ${n}`
    els.totals.appendChild(li)
  }

  els.stop.disabled = !p.running
  els.recheck.disabled = p.running || totals.invalid + totals.warning === 0
  els.report.disabled = totals.total === 0
  els.scanPage.disabled = p.running || !scannable
  els.scanSite.disabled = p.running || !scannable
}

void init()
