import type { LinkRecord, ScanState, ScanMode, ScanTotals, ResourceKind } from './types.js'

/** One reference found in a page, before it is checked. */
export interface CollectedRef {
  /** DOM element id assigned by the content script (data-btc-id). */
  elementId: string
  raw: string
  kind: ResourceKind
  text: string
  /** Content script resolved an in-page #anchor locally: does the target exist? */
  anchorFound?: boolean
  /** Element sat inside one of the excluded selectors (header, footer, …). */
  excludedBySelector?: boolean
}

export interface ScanProgress {
  running: boolean
  mode: ScanMode
  totals: ScanTotals
  pagesCrawled: number
  pagesQueued: number
  origin: string
}

export type ToBackground =
  | { type: 'START_SCAN'; mode: ScanMode; tabId: number; pageUrl: string }
  | { type: 'STOP_SCAN' }
  | { type: 'RECHECK_BROKEN' }
  | { type: 'CLEAR' }
  | { type: 'GET_PROGRESS' }
  | { type: 'GET_STATE' }
  | { type: 'PAGE_REFS'; refs: CollectedRef[]; pageUrl: string }
  | { type: 'OPEN_REPORT' }

export type ToContent =
  | { type: 'COLLECT' }
  | { type: 'SCAN_STARTED' }
  | { type: 'RESULT'; record: LinkRecord; elementIds: string[] }
  | { type: 'PROGRESS'; progress: ScanProgress }
  | { type: 'SCAN_DONE'; progress: ScanProgress }
  | { type: 'CLEAR_HIGHLIGHTS' }

export type ToPopup =
  | { type: 'PROGRESS'; progress: ScanProgress }
  | { type: 'STATE'; state: ScanState }

export const SESSION_KEY = 'lastScan'

/**
 * Everything needed to rebuild a finished scan after the service worker has
 * been shut down. MV3 terminates the worker whenever it is idle, so anything
 * held only in a module variable is gone by the time the user clicks
 * "Re-check failures" a minute later.
 */
export interface PersistedSession {
  state: ScanState
  tabId: number
  /** record key -> the data-btc-id values that point at it. */
  elements: [string, string[]][]
}
