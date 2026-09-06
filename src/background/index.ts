import { loadSettings, type Settings } from '../core/settings.js'
import { TaskQueue } from '../core/queue.js'
import { compileExcludes } from '../core/exclude.js'
import { classifyStatus, statusNote } from '../core/classify.js'
import {
  hostOf, isEmptyHref, isInPageAnchor, isUncheckableScheme, normalizeUrl, resolveUrl,
} from '../core/url.js'
import { EMPTY_TOTALS, type LinkRecord, type ScanMode, type ScanState, type ScanTotals } from '../core/types.js'
import {
  SESSION_KEY,
  type CollectedRef,
  type PersistedSession,
  type ScanProgress,
  type ToBackground,
} from '../core/messages.js'
import { RedirectTracker } from './redirects.js'
import { checkUrl } from './checker.js'
import { crawlSite } from './crawler.js'
import { closeParser } from './offscreen.js'
import { installBrowserLikeHeaders } from './request-headers.js'

const tracker = new RedirectTracker()

interface Session {
  id: string
  mode: ScanMode
  tabId: number
  origin: string
  startedAt: number
  running: boolean
  settings: Settings
  isExcluded: (url: string) => boolean
  queue: TaskQueue
  /** Keyed by normalized URL (or a synthetic key for empty/anchor findings). */
  records: Map<string, LinkRecord>
  elements: Map<string, string[]>
  pagesCrawled: number
  pagesQueued: number
  /** Hosts that answered 429/503; each gets one polite retry. */
  backedOff: Set<string>
}

let session: Session | null = null
let broadcastTimer: ReturnType<typeof setTimeout> | null = null

chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  const msg = raw as ToBackground & { target?: string }
  if (msg?.target === 'offscreen') return undefined

  switch (msg?.type) {
    case 'START_SCAN':
      void startScan(msg.mode, msg.tabId, msg.pageUrl)
      sendResponse({ ok: true })
      return true
    case 'STOP_SCAN':
      stopScan()
      sendResponse({ ok: true })
      return true
    case 'RECHECK_BROKEN':
      void recheckBroken()
      sendResponse({ ok: true })
      return true
    case 'CLEAR':
      void clearScan()
      sendResponse({ ok: true })
      return true
    case 'GET_PROGRESS':
      void (async () => sendResponse({ progress: await progressOfAsync() }))()
      return true
    case 'GET_STATE':
      void (async () => sendResponse({ state: await getState() }))()
      return true
    case 'PAGE_REFS':
      if (session && sender.tab?.id === session.tabId) ingest(msg.refs, msg.pageUrl, true)
      sendResponse({ ok: true })
      return true
    case 'OPEN_REPORT':
      void chrome.tabs.create({ url: chrome.runtime.getURL('report/report.html') })
      sendResponse({ ok: true })
      return true
    default:
      return undefined
  }
})

async function startScan(mode: ScanMode, tabId: number, pageUrl: string): Promise<void> {
  stopScan()
  const settings = await loadSettings()

  tracker.attach()
  tracker.reset()
  // Best effort: without it, bot-protected sites answer 403 to our requests.
  await installBrowserLikeHeaders()

  session = {
    id: `${Date.now()}`,
    mode,
    tabId,
    origin: pageUrl,
    startedAt: Date.now(),
    running: true,
    settings,
    isExcluded: compileExcludes(settings.excludePatterns),
    queue: new TaskQueue({
      concurrency: settings.concurrency,
      perHostConcurrency: settings.perHostConcurrency,
      hostDelayMs: settings.hostDelayMs,
    }),
    records: new Map(),
    elements: new Map(),
    pagesCrawled: 0,
    pagesQueued: 0,
    backedOff: new Set(),
  }

  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
  await sendToTab(tabId, { type: 'SCAN_STARTED' })
  await sendToTab(tabId, { type: 'COLLECT' })

  if (mode === 'site') void runCrawl(pageUrl, settings)
  void waitForIdle()
}

async function runCrawl(pageUrl: string, settings: Settings): Promise<void> {
  const active = session
  if (!active) return
  await crawlSite(pageUrl, settings, {
    onPage: (url, refs) => ingest(refs, url, false),
    onProgress: (crawled, queued) => {
      if (session !== active) return
      session.pagesCrawled = crawled
      session.pagesQueued = queued
      scheduleBroadcast()
    },
    shouldStop: () => session !== active || !session.running,
  })
  await closeParser()
}

/** Turn raw refs into records and enqueue whatever needs a network check. */
function ingest(refs: CollectedRef[], pageUrl: string, fromLivePage: boolean): void {
  const s = session
  if (!s) return

  for (const ref of refs) {
    const decided = decide(ref, pageUrl, s)
    const existing = s.records.get(decided.key)

    if (existing) {
      existing.occurrences++
      addElement(s, decided.key, ref.elementId)
      if (fromLivePage && existing.category !== 'pending') {
        void sendToTab(s.tabId, { type: 'RESULT', record: existing, elementIds: [ref.elementId] })
      }
      continue
    }

    const record: LinkRecord = {
      id: decided.key,
      url: decided.url,
      raw: ref.raw,
      kind: ref.kind,
      text: ref.text,
      foundOn: pageUrl,
      category: decided.category,
      status: null,
      statusText: '',
      finalUrl: null,
      redirects: [],
      redirectLoop: false,
      contentType: null,
      durationMs: null,
      error: decided.error,
      note: null,
      occurrences: 1,
      checkedAt: Date.now(),
    }
    s.records.set(decided.key, record)
    addElement(s, decided.key, ref.elementId)

    if (decided.category === 'pending') {
      enqueue(s, record)
    } else {
      emit(s, record)
    }
  }
  scheduleBroadcast()
}

interface Decision {
  key: string
  url: string
  category: LinkRecord['category']
  error: string | null
}

function decide(ref: CollectedRef, pageUrl: string, s: Session): Decision {
  if (ref.excludedBySelector) {
    return { key: `sel:${ref.elementId}`, url: ref.raw, category: 'excluded', error: null }
  }
  if (isEmptyHref(ref.raw)) {
    return {
      key: `empty:${ref.elementId}`,
      url: ref.raw,
      category: s.settings.includeEmpty ? 'empty' : 'skipped',
      error: s.settings.includeEmpty ? 'Empty href' : null,
    }
  }
  if (isInPageAnchor(ref.raw)) {
    const found = ref.anchorFound === true
    // Normalised so that scanning a page and crawling the same page agree on the
    // key, instead of filing the same anchor twice under two spellings of the URL.
    const page = normalizeUrl(pageUrl) ?? pageUrl
    const key = `anchor:${page}${ref.raw}`

    // Undefined means nobody actually resolved this anchor — anchor checking is
    // switched off, or it came from a source that could not answer. "We did not
    // look" must never be reported as "this is broken".
    if (ref.anchorFound === undefined) {
      return { key, url: ref.raw, category: 'skipped', error: null }
    }
    return {
      key,
      url: ref.raw,
      category: found ? 'valid' : 'invalid',
      error: found
        ? null
        : 'Nothing on this page has this id. Pages that build their anchor targets in JavaScript after load can report this even when the jump works.',
    }
  }
  if (isUncheckableScheme(ref.raw)) {
    return { key: `skip:${ref.raw}`, url: ref.raw, category: 'skipped', error: null }
  }

  const abs = resolveUrl(ref.raw, pageUrl)
  const normalized = abs ? normalizeUrl(abs) : null
  if (!normalized) {
    return { key: `bad:${ref.elementId}`, url: ref.raw, category: 'invalid', error: 'Malformed URL' }
  }
  if (s.isExcluded(normalized)) {
    return { key: normalized, url: normalized, category: 'excluded', error: null }
  }
  return { key: normalized, url: normalized, category: 'pending', error: null }
}

function enqueue(s: Session, record: LinkRecord): void {
  void s.queue
    .add(hostOf(record.url), async () => {
      const outcome = await checkUrl(
        record.url,
        { timeoutMs: s.settings.timeoutMs, retries: s.settings.retries },
        tracker,
      )
      if (session !== s) return

      // A rate-limited host is asking us to slow down, so slow down: pause every
      // queued request for that host and give this one URL a second chance.
      // Without this, a scan can get the *user's own IP* throttled by the site.
      const host = hostOf(record.url)
      if ((outcome.status === 429 || outcome.status === 503) && !s.backedOff.has(host)) {
        s.backedOff.add(host)
        const wait = outcome.retryAfterMs ?? 5000
        s.queue.penalize(host, wait)
        enqueue(s, record)
        return
      }

      record.status = outcome.status
      record.statusText = outcome.statusText
      record.finalUrl = outcome.finalUrl
      record.redirects = outcome.redirects
      record.redirectLoop = outcome.redirectLoop
      record.contentType = outcome.contentType
      record.durationMs = outcome.durationMs
      record.error = outcome.error
      record.note = statusNote(outcome.status, outcome.finalUrl)
      record.checkedAt = Date.now()
      record.category =
        outcome.status === null
          ? 'invalid'
          : outcome.redirects.length > 0
            ? 'redirect'
            : classifyStatus(outcome.status)
      emit(s, record)
      scheduleBroadcast()
    })
    .catch(() => {
      /* cancelled — the scan was stopped */
    })
}

function emit(s: Session, record: LinkRecord): void {
  const ids = s.elements.get(record.id) ?? []
  void sendToTab(s.tabId, { type: 'RESULT', record, elementIds: ids })
}

function addElement(s: Session, key: string, elementId: string): void {
  const list = s.elements.get(key)
  if (list) list.push(elementId)
  else s.elements.set(key, [elementId])
}

async function waitForIdle(): Promise<void> {
  const s = session
  if (!s) return
  // The crawl keeps adding work, so poll until both the queue and the crawl settle.
  for (;;) {
    await s.queue.onIdle()
    await sleep(300)
    if (session !== s || !s.running) return
    if (s.queue.size === 0 && (s.mode === 'page' || s.pagesQueued === 0)) break
  }
  s.running = false
  await persist()
  broadcast(true)
}

function stopScan(): void {
  if (!session) return
  session.running = false
  session.queue.stop()
  void persist()
  broadcast(true)
}

async function clearScan(): Promise<void> {
  const tabId = session?.tabId
  stopScan()
  session = null
  await chrome.storage.session.remove(SESSION_KEY)
  if (tabId !== undefined) await sendToTab(tabId, { type: 'CLEAR_HIGHLIGHTS' })
}

/**
 * Bring `session` back after the service worker has been torn down.
 *
 * MV3 kills an idle worker within about thirty seconds, which is well inside
 * the time it takes someone to read a report and click "Re-check failures".
 * Without this the click did nothing at all, silently.
 */
async function restoreSession(): Promise<Session | null> {
  if (session) return session
  const stored = (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY] as
    | PersistedSession
    | undefined
  if (!stored) return null

  const settings = await loadSettings()
  session = {
    id: stored.state.id,
    mode: stored.state.mode,
    tabId: stored.tabId,
    origin: stored.state.origin,
    startedAt: stored.state.startedAt,
    running: false,
    settings,
    isExcluded: compileExcludes(settings.excludePatterns),
    queue: new TaskQueue({
      concurrency: settings.concurrency,
      perHostConcurrency: settings.perHostConcurrency,
      hostDelayMs: settings.hostDelayMs,
    }),
    records: new Map(stored.state.results.map((r) => [r.id, r])),
    elements: new Map(stored.elements),
    pagesCrawled: stored.state.pagesCrawled,
    pagesQueued: 0,
    backedOff: new Set(),
  }
  return session
}

async function recheckBroken(): Promise<void> {
  const s = await restoreSession()
  if (!s) return
  tracker.attach()
  await installBrowserLikeHeaders()
  const broken = [...s.records.values()].filter(
    (r) => r.category === 'invalid' || r.category === 'warning',
  )
  if (broken.length === 0) return
  s.running = true
  for (const record of broken) {
    if (record.url.startsWith('#') || !record.url.startsWith('http')) continue
    record.category = 'pending'
    enqueue(s, record)
  }
  void waitForIdle()
}

function totalsOf(s: Session): ScanTotals {
  const totals: ScanTotals = { ...EMPTY_TOTALS }
  for (const r of s.records.values()) {
    totals.total++
    if (r.category !== 'pending') totals.checked++
    if (r.category in totals) (totals as unknown as Record<string, number>)[r.category]++
  }
  return totals
}

function progressOf(): ScanProgress {
  if (!session) {
    return { running: false, mode: 'page', totals: { ...EMPTY_TOTALS }, pagesCrawled: 0, pagesQueued: 0, origin: '' }
  }
  return {
    running: session.running,
    mode: session.mode,
    totals: totalsOf(session),
    pagesCrawled: session.pagesCrawled,
    pagesQueued: session.pagesQueued,
    origin: session.origin,
  }
}

async function getState(): Promise<ScanState | null> {
  const s = await restoreSession()
  return s ? snapshot(s) : null
}

/** Like progressOf(), but revives a scan the worker has forgotten. */
async function progressOfAsync(): Promise<ScanProgress> {
  await restoreSession()
  return progressOf()
}

function snapshot(s: Session): ScanState {
  return {
    id: s.id,
    mode: s.mode,
    origin: s.origin,
    startedAt: s.startedAt,
    finishedAt: s.running ? null : Date.now(),
    running: s.running,
    pagesCrawled: s.pagesCrawled,
    pagesQueued: s.pagesQueued,
    totals: totalsOf(s),
    results: [...s.records.values()],
  }
}

async function persist(): Promise<void> {
  if (!session) return
  const payload: PersistedSession = {
    state: snapshot(session),
    tabId: session.tabId,
    elements: [...session.elements.entries()],
  }
  try {
    await chrome.storage.session.set({ [SESSION_KEY]: payload })
  } catch {
    /* over quota on a very large crawl — the live session still has the data */
  }
}

function scheduleBroadcast(): void {
  if (broadcastTimer !== null) return
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null
    broadcast(false)
    // Checkpoint as we go: if the worker dies mid-crawl, the results so far
    // survive instead of vanishing with it.
    void persist()
  }, 200)
}

function broadcast(done: boolean): void {
  const progress = progressOf()
  const message = done ? ({ type: 'SCAN_DONE', progress } as const) : ({ type: 'PROGRESS', progress } as const)
  chrome.runtime.sendMessage(message).catch(() => {})
  if (session) void sendToTab(session.tabId, message)
}

async function sendToTab(tabId: number, message: unknown): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message)
  } catch {
    /* tab closed or navigated away mid-scan */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
