import type { LinkRecord } from './types.js'

const COLUMNS = [
  'status', 'category', 'url', 'text', 'kind', 'found_on',
  'final_url', 'redirect_hops', 'redirect_chain', 'redirect_loop',
  'content_type', 'duration_ms', 'occurrences', 'error', 'note',
] as const

/** RFC 4180 field escaping. */
export function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(records: LinkRecord[]): string {
  const rows = [COLUMNS.join(',')]
  for (const r of records) {
    rows.push(
      [
        r.status ?? '',
        r.category,
        r.url,
        r.text,
        r.kind,
        r.foundOn,
        r.finalUrl ?? '',
        r.redirects.length,
        r.redirects.map((h) => `${h.status} -> ${h.to}`).join(' | '),
        r.redirectLoop ? 'yes' : '',
        r.contentType ?? '',
        r.durationMs ?? '',
        r.occurrences,
        r.error ?? '',
        r.note ?? '',
      ]
        .map(csvCell)
        .join(','),
    )
  }
  // BOM so Excel opens UTF-8 (and Hebrew anchor text) correctly.
  return '﻿' + rows.join('\r\n') + '\r\n'
}

export function toJson(records: LinkRecord[], meta: Record<string, unknown> = {}): string {
  return JSON.stringify(
    { generator: 'break-the-chain', exportedAt: new Date().toISOString(), ...meta, records },
    null,
    2,
  )
}

export function suggestFilename(origin: string, ext: 'csv' | 'json'): string {
  let host = 'scan'
  try { host = new URL(origin).hostname || host } catch { /* keep default */ }
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  return `break-the-chain_${host}_${stamp}.${ext}`
}
