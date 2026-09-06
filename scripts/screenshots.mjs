/**
 * Produces the Chrome Web Store assets by driving the real built extension:
 * three 1280x800 screenshots and a 440x280 promo tile.
 *
 *   npm run build && node scripts/screenshots.mjs
 *
 * Output lands in store-assets/.
 */
import { chromium } from '@playwright/test'
import http from 'node:http'
import { readFileSync, mkdirSync, cpSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'store-assets')
const SHOT = { width: 1280, height: 800 }

function startDemoServer() {
  const server = http.createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0]
    const send = (status, body = '', headers = {}) => { res.writeHead(status, headers); res.end(body) }
    switch (url) {
      case '/': return send(200, readFileSync(join(root, 'scripts/demo/index.html')), { 'content-type': 'text/html; charset=utf-8' })
      case '/logo.png': return send(200, readFileSync(join(root, 'scripts/demo/logo.png')), { 'content-type': 'image/png' })
      case '/ok': return send(200, '<h1 id="ok">ok</h1><a href="#ok">self</a>', { 'content-type': 'text/html' })
      case '/gone': return send(410, 'gone')
      case '/error': return send(500, 'boom')
      case '/hop1': return send(301, '', { location: '/hop2' })
      case '/hop2': return send(302, '', { location: '/hop3' })
      case '/hop3': return send(200, 'arrived', { 'content-type': 'text/html' })
      default: return send(404, 'not found')
    }
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({ origin: `http://127.0.0.1:${port}`, close: () => new Promise((d) => server.close(d)) })
    })
  })
}

/** The shipped manifest asks for <all_urls> at runtime; a screenshot run can't click that prompt. */
function buildScreenshotExtension() {
  const src = join(root, 'dist')
  const dst = join(root, '.dist-shots')
  if (!existsSync(src)) throw new Error('Run `npm run build` first.')
  rmSync(dst, { recursive: true, force: true })
  cpSync(src, dst, { recursive: true })
  const file = join(dst, 'manifest.json')
  const manifest = JSON.parse(readFileSync(file, 'utf8'))
  manifest.host_permissions = ['<all_urls>']
  delete manifest.optional_host_permissions
  writeFileSync(file, JSON.stringify(manifest, null, 2))
  return dst
}

const promoTile = (w, h, titleSize, subSize) => `
<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0}
  body{width:${w}px;height:${h}px;overflow:hidden;
       font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
       background:radial-gradient(120% 140% at 12% 0%,#1b2130 0%,#0f1219 60%);
       color:#e7eaf0;display:flex;flex-direction:column;justify-content:center;padding:0 ${Math.round(w*0.075)}px}
  .row{display:flex;align-items:center;gap:${Math.round(w*0.028)}px;margin-bottom:${Math.round(h*0.055)}px}
  .link{width:${Math.round(h*0.115)}px;height:${Math.round(h*0.072)}px;border-radius:${Math.round(h*0.04)}px}
  .a{border:${Math.max(3,Math.round(h*0.017))}px solid #4ac97e}
  .b{border:${Math.max(3,Math.round(h*0.017))}px solid #e84d4d}
  h1{font-size:${titleSize}px;margin:0;letter-spacing:-.4px;line-height:1.1}
  p{font-size:${subSize}px;margin:${Math.round(h*0.04)}px 0 0;color:#f0a24a;font-weight:600;
    max-width:${Math.round(w*0.82)}px;line-height:1.35}
  small{display:block;font-size:${Math.round(subSize*0.85)}px;color:#8a94a6;
    margin-top:${Math.round(h*0.035)}px;font-weight:400;max-width:${Math.round(w*0.82)}px}
</style>
<div class="row"><span class="link a"></span><span class="link b"></span></div>
<h1>Break the Chain</h1>
<p>Broken links, dead anchors and redirect chains</p>
<small>Runs entirely in your browser. No account, no server.</small>
`

async function main() {
  mkdirSync(out, { recursive: true })
  const server = await startDemoServer()
  const extensionPath = buildScreenshotExtension()

  const context = await chromium.launchPersistentContext('', {
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chromium' }),
    viewport: SHOT,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  })

  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  const extensionId = new URL(worker.url()).host

  const page = await context.newPage()
  await page.setViewportSize(SHOT)
  await page.goto(`${server.origin}/`)

  const tabId = await worker.evaluate(async (u) => (await chrome.tabs.query({ url: u }))[0].id, `${server.origin}/*`)

  const driver = await context.newPage()
  await driver.setViewportSize(SHOT)
  await driver.goto(`chrome-extension://${extensionId}/report/report.html`)
  await driver.evaluate(
    async ({ id, url }) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
      const state = async () => (await chrome.runtime.sendMessage({ type: 'GET_STATE' })).state
      for (let attempt = 0; attempt < 5; attempt++) {
        await chrome.runtime.sendMessage({ type: 'START_SCAN', mode: 'page', tabId: id, pageUrl: url }).catch(() => {})
        for (let i = 0; i < 15; i++) {
          await sleep(200)
          const s = await state()
          if (s && s.results.length > 0) {
            for (let j = 0; j < 100 && (await state()).running; j++) await sleep(200)
            return
          }
        }
      }
      throw new Error('scan never started')
    },
    { id: tabId, url: `${server.origin}/` },
  )

  await page.bringToFront()
  await page.waitForTimeout(900)
  await page.screenshot({ path: join(out, 'screenshot-1-scan.png') })

  await driver.reload()
  await driver.waitForTimeout(700)
  await driver.screenshot({ path: join(out, 'screenshot-2-report.png') })

  await driver.goto(`chrome-extension://${extensionId}/options/options.html`)
  await driver.waitForTimeout(500)
  await driver.screenshot({ path: join(out, 'screenshot-3-settings.png') })

  for (const [name, w, h, t, sub] of [
    ['promo-small-440x280', 440, 280, 29, 13],
    ['promo-marquee-1400x560', 1400, 560, 78, 30],
  ]) {
    const tile = await context.newPage()
    await tile.setViewportSize({ width: w, height: h })
    await tile.setContent(promoTile(w, h, t, sub))
    await tile.screenshot({ path: join(out, `${name}.png`) })
    await tile.close()
  }

  await context.close()
  await server.close()
  rmSync(extensionPath, { recursive: true, force: true })
  console.log(`store assets written to ${out}`)
}

await main()
