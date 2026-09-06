import { test, expect, chromium, type BrowserContext, type Worker } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { startFixtureServer } from './server.js'
import { buildTestExtension } from './build-test-extension.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

interface ScanRecord {
  url: string
  raw: string
  kind: string
  foundOn: string
  category: string
  status: number | null
  redirects: { status: number; to: string }[]
  occurrences: number
}

let context: BrowserContext
let worker: Worker
let origin: string
let closeServer: () => Promise<void>
let extensionId: string

test.beforeAll(async () => {
  const server = await startFixtureServer()
  origin = server.origin
  closeServer = server.close

  const extensionPath = buildTestExtension(root)
  // CHROMIUM_PATH lets CI (or a sandbox) point at a preinstalled browser
  // instead of the one Playwright downloads.
  context = await chromium.launchPersistentContext('', {
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chromium' }),
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  })
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  extensionId = new URL(worker.url()).host
})

test.afterAll(async () => {
  await context?.close()
  await closeServer?.()
})

async function runScan(mode: 'page' | 'site') {
  const page = await context.newPage()
  await page.goto(`${origin}/`)

  const tabId = await worker.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url })
    return tab.id!
  }, `${origin}/*`)

  // Extension pages can message the service worker; a plain page cannot.
  const driver = await context.newPage()
  await driver.goto(`chrome-extension://${extensionId}/report/report.html`)

  const records = (await driver.evaluate(
    async ({ id, scanMode }: { id: number; scanMode: string }) => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
      const state = async () =>
        ((await chrome.runtime.sendMessage({ type: 'GET_STATE' })) as {
          state: { running: boolean; results: unknown[] } | null
        }).state

      // A just-installed service worker can still be starting up, in which case
      // the first START_SCAN lands before its listener is registered and is
      // silently dropped. Re-send until the scan is actually under way.
      for (let attempt = 0; attempt < 5; attempt++) {
        await chrome.runtime
          .sendMessage({ type: 'START_SCAN', mode: scanMode, tabId: id })
          .catch(() => {})
        for (let i = 0; i < 15; i++) {
          await sleep(200)
          const s = await state()
          if (s && s.results.length > 0) {
            for (let j = 0; j < 150 && (await state())!.running; j++) await sleep(200)
            return (await state())!.results
          }
        }
      }
      throw new Error('scan never started')
    },
    { id: tabId, scanMode: mode },
  )) as ScanRecord[]

  return { page, driver, records }
}

test('scans a page and classifies every kind of link correctly', async () => {
  const { page, records } = await runScan('page')

  const byRaw = (raw: string) => records.find((r) => r.raw === raw)

  await test.step('a working link is valid', () => {
    expect(byRaw('/ok')).toMatchObject({ category: 'valid', status: 200 })
  })

  await test.step('404 and 500 are reported as broken', () => {
    expect(byRaw('/missing')).toMatchObject({ category: 'invalid', status: 404 })
    expect(byRaw('/server-error')).toMatchObject({ category: 'invalid', status: 500 })
  })

  await test.step('the full redirect chain is recorded, not just the final url', () => {
    const chain = byRaw('/hop1')
    expect(chain?.category).toBe('redirect')
    expect(chain?.redirects.map((h) => h.status)).toEqual([301, 302])
    expect(chain?.redirects.at(-1)?.to).toContain('/hop3')
  })

  await test.step('a 429 is retried after backing off, not reported as broken', () => {
    expect(byRaw('/rate-limited')).toMatchObject({ category: 'valid', status: 200 })
  })

  await test.step('in-page anchors are resolved without a request', () => {
    expect(byRaw('#real-anchor')).toMatchObject({ category: 'valid' })
    expect(byRaw('#ghost')).toMatchObject({ category: 'invalid' })
  })

  await test.step('an empty href is flagged, and mailto: is skipped', () => {
    expect(byRaw('')?.category).toBe('empty')
    expect(records.find((r) => r.raw.startsWith('mailto:'))?.category).toBe('skipped')
  })

  await test.step('a broken image is found', () => {
    expect(byRaw('/missing.png')).toMatchObject({ kind: 'image', category: 'invalid', status: 404 })
  })

  await test.step('links inside a shadow root are found', () => {
    expect(byRaw('/shadow-missing')).toMatchObject({ category: 'invalid', status: 404 })
  })

  await test.step('repeated urls are deduplicated into one checked record', () => {
    expect(records.filter((r) => r.raw === '/ok')).toHaveLength(1)
    expect(byRaw('/ok')?.occurrences).toBeGreaterThanOrEqual(2)
  })

  await test.step('the panel sits in the corner it was told to, not in the page flow', async () => {
    const box = await page.locator('#break-the-chain-panel').evaluate((host) => {
      const wrap = (host as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot.querySelector('.wrap')!
      const r = wrap.getBoundingClientRect()
      return {
        fromBottom: window.innerHeight - r.bottom,
        fromRight: window.innerWidth - r.right,
        fromTop: r.top,
        position: getComputedStyle(wrap).position,
      }
    })
    expect(box.position).toBe('fixed')
    expect(box.fromBottom).toBeLessThan(40)
    expect(box.fromRight).toBeLessThan(40)
  })

  await test.step('the corner button moves the panel and it stays put', async () => {
    const corner = async () =>
      page.locator('#break-the-chain-panel').evaluate((host) => {
        const shadow = (host as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot
        const r = shadow.querySelector('.wrap')!.getBoundingClientRect()
        return { fromBottom: window.innerHeight - r.bottom, fromLeft: r.left }
      })

    const glyph = async () =>
      page.locator('#break-the-chain-panel').evaluate((host) => {
        const shadow = (host as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot
        return shadow.querySelector('.hdr button.corner')!.textContent
      })

    expect((await corner()).fromLeft).toBeGreaterThan(100)
    expect(await glyph()).toBe('\u2597') // bottom-right quadrant

    await page.locator('#break-the-chain-panel').evaluate((host) => {
      const shadow = (host as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot
      shadow.querySelector<HTMLButtonElement>('.hdr button.corner')!.click()
    })
    expect(await glyph()).toBe('\u2596') // bottom-left quadrant
    const moved = await corner()
    expect(moved.fromLeft).toBeLessThan(40)
    expect(moved.fromBottom).toBeLessThan(40)
  })

  await test.step('the page is visually marked up', async () => {
    const outlined = await page.locator('a[data-btc-cat="invalid"]').count()
    expect(outlined).toBeGreaterThan(0)
    await expect(page.locator('#break-the-chain-panel')).toHaveCount(1)
  })
})

test('a site crawl resolves in-page anchors instead of calling them broken', async () => {
  const { records } = await runScan('site')
  const byRaw = (raw: string) => records.find((r) => r.raw === raw)

  await test.step('the crawler visited more than the starting page', () => {
    const pages = new Set(records.map((r) => r.foundOn))
    expect(pages.size).toBeGreaterThan(1)
  })

  await test.step('anchors on a crawled page are resolved by the crawler itself', () => {
    // These live on /ok, which the content script never touches — only the
    // offscreen HTML parser can answer for them.
    expect(byRaw('#second-anchor')).toMatchObject({ category: 'valid', foundOn: `${origin}/ok` })
    expect(byRaw('#top')).toMatchObject({ category: 'valid' })
    expect(byRaw('#not-here')?.category).toBe('invalid')
  })

  await test.step('anchors on the starting page still work', () => {
    expect(byRaw('#real-anchor')?.category).toBe('valid')
    expect(byRaw('#ghost')?.category).toBe('invalid')
  })

  await test.step('no anchor is reported broken without having been resolved', () => {
    const deadOnPurpose = new Set(['#ghost', '#not-here'])
    const wrong = records.filter(
      (r) => r.raw.startsWith('#') && r.category === 'invalid' && !deadOnPurpose.has(r.raw),
    )
    expect(wrong.map((r) => r.raw)).toEqual([])
  })

  await test.step('the ordinary findings still hold during a crawl', () => {
    expect(byRaw('/missing')).toMatchObject({ category: 'invalid', status: 404 })
    expect(byRaw('/ok')).toMatchObject({ category: 'valid', status: 200 })
  })
})
