/**
 * Makes the extension's own requests look like a browser instead of a script.
 *
 * A `fetch()` from an MV3 service worker carries `Origin: chrome-extension://…`
 * and `Sec-Fetch-Mode: cors` / `Sec-Fetch-Dest: empty`. Bot-protection layers in
 * front of large commerce sites (Etsy, Amazon, most Cloudflare and Akamai
 * customers) read exactly those headers and answer 403 — for URLs that load
 * perfectly in a real tab. That produces false "broken link" reports, which is
 * the fastest way to make a link checker useless.
 *
 * declarativeNetRequest rewrites those headers on our own requests only:
 * `tabIds: [-1]` matches requests that do not come from any tab, which is
 * precisely the service worker's traffic. Nothing the user browses is touched.
 *
 * Uses `declarativeNetRequestWithHostAccess`, which is scoped to the host
 * permissions the user granted, rather than the broader `declarativeNetRequest`.
 */
const RULE_ID = 1

export async function installBrowserLikeHeaders(): Promise<boolean> {
  if (!chrome.declarativeNetRequest?.updateSessionRules) return false
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [RULE_ID],
      addRules: [
        {
          id: RULE_ID,
          priority: 1,
          action: {
            type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
            requestHeaders: [
              { header: 'Origin', operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE },
              { header: 'Sec-Fetch-Site', operation: chrome.declarativeNetRequest.HeaderOperation.SET, value: 'none' },
              { header: 'Sec-Fetch-Mode', operation: chrome.declarativeNetRequest.HeaderOperation.SET, value: 'navigate' },
              { header: 'Sec-Fetch-Dest', operation: chrome.declarativeNetRequest.HeaderOperation.SET, value: 'document' },
              { header: 'Sec-Fetch-User', operation: chrome.declarativeNetRequest.HeaderOperation.SET, value: '?1' },
              { header: 'Upgrade-Insecure-Requests', operation: chrome.declarativeNetRequest.HeaderOperation.SET, value: '1' },
            ],
          },
          condition: {
            resourceTypes: [chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST],
            tabIds: [-1],
          },
        },
      ],
    })
    return true
  } catch {
    return false
  }
}

export async function removeBrowserLikeHeaders(): Promise<void> {
  try {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [RULE_ID] })
  } catch {
    /* nothing installed */
  }
}
