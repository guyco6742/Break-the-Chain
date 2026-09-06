export interface PanelPosition {
  left: number
  top: number
}

export interface Settings {
  /** Bumped when a default changes in a way that must override stored values. */
  schemaVersion: number
  /** Parallel requests in flight, overall. */
  concurrency: number
  /** Parallel requests in flight per hostname (politeness). */
  perHostConcurrency: number
  /** Milliseconds before a request is abandoned. */
  timeoutMs: number
  /** Retries after a network error (not after an HTTP error status). */
  retries: number
  /** Delay between requests to the same host, ms. */
  hostDelayMs: number

  checkImages: boolean
  checkScripts: boolean
  checkStylesheets: boolean
  checkAnchors: boolean
  /** Report href="" / href="#" as findings instead of ignoring them. */
  includeEmpty: boolean
  /** Follow links inside same-origin iframes and shadow roots. */
  deepScan: boolean

  /** URL patterns to skip. Supports * wildcards, or /regex/ syntax. */
  excludePatterns: string[]
  /** CSS selectors whose subtree is skipped, e.g. header, footer, nav. */
  excludeSelectors: string[]

  /** Site crawl limits. */
  maxDepth: number
  maxPages: number
  respectRobots: boolean
  useSitemap: boolean

  colors: {
    valid: string
    redirect: string
    warning: string
    invalid: string
    excluded: string
  }
  showBadges: boolean
  panelCorner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
  /** Where the user last dragged the panel. Wins over panelCorner when set. */
  panelPos: PanelPosition | null
}

/**
 * Anything in here is reset once, on upgrade, even if the user has stored
 * settings. v2 moved the panel out of the top-right corner, where it sat
 * directly underneath the browser action popup and looked broken.
 */
export const SCHEMA_VERSION = 2
const RESET_ON_UPGRADE = ['panelCorner', 'panelPos'] as const

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: SCHEMA_VERSION,
  concurrency: 8,
  perHostConcurrency: 3,
  timeoutMs: 15000,
  retries: 1,
  hostDelayMs: 0,

  checkImages: true,
  checkScripts: false,
  checkStylesheets: false,
  checkAnchors: true,
  includeEmpty: true,
  deepScan: true,

  excludePatterns: [],
  excludeSelectors: [],

  maxDepth: 2,
  maxPages: 50,
  respectRobots: true,
  useSitemap: true,

  colors: {
    valid: '#2f8f4e',
    redirect: '#2563c9',
    warning: '#b8860b',
    invalid: '#c0392b',
    excluded: '#6b7280',
  },
  showBadges: true,
  panelCorner: 'bottom-right',
  panelPos: null,
}

const KEY = 'settings'

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(KEY)
  return mergeSettings(stored[KEY])
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = mergeSettings({ ...(await loadSettings()), ...patch })
  await chrome.storage.sync.set({ [KEY]: next })
  return next
}

/** Defensive merge: a settings object written by an older version must still boot. */
export function mergeSettings(raw: unknown): Settings {
  const s = { ...((raw ?? {}) as Partial<Settings>) }
  if ((s.schemaVersion ?? 0) < SCHEMA_VERSION) {
    for (const key of RESET_ON_UPGRADE) delete s[key]
  }
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    schemaVersion: SCHEMA_VERSION,
    colors: { ...DEFAULT_SETTINGS.colors, ...(s.colors ?? {}) },
    excludePatterns: Array.isArray(s.excludePatterns) ? s.excludePatterns : [],
    excludeSelectors: Array.isArray(s.excludeSelectors) ? s.excludeSelectors : [],
  }
}
