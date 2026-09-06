import type { ParsedRef } from '../offscreen/offscreen.js'

const PATH = 'offscreen/offscreen.html'
let creating: Promise<void> | null = null

async function ensureDocument(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return
  if (creating) return creating
  creating = chrome.offscreen
    .createDocument({
      url: PATH,
      reasons: [chrome.offscreen.Reason.DOM_PARSER],
      justification: 'Parse fetched page HTML with DOMParser to extract links during a site crawl.',
    })
    .finally(() => {
      creating = null
    })
  return creating
}

export async function closeParser(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument()
}

export async function parseHtml(
  html: string,
  want: { images: boolean; scripts: boolean; stylesheets: boolean },
): Promise<ParsedRef[]> {
  await ensureDocument()
  const res = (await chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'PARSE_HTML',
    html,
    want,
  })) as { refs: ParsedRef[] } | undefined
  return res?.refs ?? []
}
