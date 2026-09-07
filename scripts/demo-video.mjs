/**
 * Records a short screencast of the real extension doing a real scan.
 *
 *   npm run video
 *
 * Produces store-assets/demo.mp4 (for YouTube / the store listing) and
 * store-assets/demo.gif (for the README). Nothing here is staged or faked —
 * every status code on screen came from an actual request.
 */
import { chromium } from '@playwright/test'
import { renderSoundtrack, writeWav } from './soundtrack.mjs'
import http from 'node:http'
import { spawnSync } from 'node:child_process'
import { readFileSync, mkdirSync, cpSync, rmSync, existsSync, writeFileSync, readdirSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'store-assets')
const raw = join(root, '.video-raw')
const SIZE = { width: 1280, height: 800 }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

function startDemoServer() {
  const server = http.createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0]
    const send = (status, body = '', headers = {}) => { res.writeHead(status, headers); res.end(body) }
    switch (url) {
      case '/': return send(200, readFileSync(join(root, 'scripts/demo/index.html')), { 'content-type': 'text/html; charset=utf-8' })
      case '/logo.png': return send(200, readFileSync(join(root, 'scripts/demo/logo.png')), { 'content-type': 'image/png' })
      case '/ok': return send(200, '<h1 id="ok">ok</h1>', { 'content-type': 'text/html' })
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

function buildRecordingExtension() {
  const src = join(root, 'dist')
  const dst = join(root, '.dist-video')
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

const card = (title, sub) => `
<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;height:100%}
  body{background:radial-gradient(120% 140% at 12% 0%,#1b2130 0%,#0f1219 60%);color:#e7eaf0;
       font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
       display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px}
  .mark{display:flex;gap:14px}
  .mark i{width:62px;height:38px;border-radius:19px;display:block}
  .a{border:7px solid #4ac97e}.b{border:7px solid #e84d4d}
  h1{font-size:62px;margin:0;letter-spacing:-1.4px}
  p{font-size:24px;margin:0;color:#f0a24a;font-weight:600}
</style>
<div class="mark"><i class="a"></i><i class="b"></i></div>
<h1>${title}</h1><p>${sub}</p>`

/** A caption strip injected into whatever page is on screen. */
const caption = (text) => {
  const existing = document.getElementById('btc-caption')
  if (existing) existing.remove()
  const el = document.createElement('div')
  el.id = 'btc-caption'
  // A flex row with an inner span: setting text-align on the strip alone let a
  // long line overflow the viewport and get clipped mid-sentence.
  Object.assign(el.style, {
    // Top, not bottom: the extension's own panel lives in the bottom-right
    // corner at a higher z-index and was covering the end of every sentence.
    position: 'fixed', left: '0', right: '0', top: '0', zIndex: '2147483646',
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    boxSizing: 'border-box', minHeight: '58px', padding: '14px 32px',
    background: '#0b0e14', borderBottom: '2px solid #f0a24a', direction: 'ltr',
  })
  const span = document.createElement('span')
  span.textContent = text
  Object.assign(span.style, {
    display: 'block', maxWidth: '1050px', color: '#f0a24a', textAlign: 'center',
    font: '600 19px/1.35 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    letterSpacing: '.2px', whiteSpace: 'normal', overflowWrap: 'anywhere',
  })
  el.appendChild(span)
  document.documentElement.appendChild(el)
}

async function main() {
  mkdirSync(out, { recursive: true })
  rmSync(raw, { recursive: true, force: true })
  const server = await startDemoServer()
  const extensionPath = buildRecordingExtension()

  const context = await chromium.launchPersistentContext('', {
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chromium' }),
    viewport: SIZE,
    recordVideo: { dir: raw, size: SIZE },
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  })
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  const extensionId = new URL(worker.url()).host

  const page = await context.newPage()
  await page.setContent(card('Break the Chain', 'Find the links that quietly stopped working'))
  await wait(2600)

  await page.goto(`${server.origin}/`)
  await page.evaluate(caption, 'A documentation page. Some of these links are already dead.')
  await wait(2600)

  const tabId = await worker.evaluate(async (u) => (await chrome.tabs.query({ url: u }))[0].id, `${server.origin}/*`)
  const driver = await context.newPage()
  await driver.goto(`chrome-extension://${extensionId}/report/report.html`)

  await page.bringToFront()
  await page.evaluate(caption, 'One click checks every link on the page.')
  await driver.evaluate(
    ({ id, url }) => chrome.runtime.sendMessage({ type: 'START_SCAN', mode: 'page', tabId: id, pageUrl: url }),
    { id: tabId, url: `${server.origin}/` },
  )
  await page.bringToFront()
  await wait(3400)

  await page.evaluate(caption, 'Green is fine. Red is broken. Every badge is a real status code.')
  await wait(3200)
  await page.evaluate(() => window.scrollTo({ top: 320, behavior: 'smooth' }))
  await wait(2600)
  await page.evaluate(caption, 'Dead anchors and broken images are found too.')
  await page.evaluate(() => window.scrollTo({ top: 640, behavior: 'smooth' }))
  await wait(3200)

  await page.goto(`chrome-extension://${extensionId}/report/report.html`)
  await page.evaluate(caption, 'The full report shows every hop of a redirect chain.')
  await wait(4200)
  await page.evaluate(() => window.scrollTo({ top: 260, behavior: 'smooth' }))
  await wait(3000)
  await page.evaluate(caption, 'Export to CSV or JSON. It all runs in your browser.')
  await wait(3400)

  await page.setContent(card('Break the Chain', 'Free and open source'))
  await wait(2600)

  const video = page.video()
  await context.close()
  const source = await video.path()
  await server.close()

  const mp4 = join(out, 'demo.mp4')
  const gif = join(out, 'demo.gif')
  const wav = join(out, 'soundtrack.wav')
  const run = (args) => spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' })

  // Length is read off the recording, so the music always ends with the video.
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
                                      '-of', 'default=nw=1:nk=1', source], { encoding: 'utf8' })
  const duration = Number(probe.stdout.trim()) || 34

  // A real track dropped in at assets/soundtrack.mp3 wins; the generated one is
  // the fallback so the pipeline still runs on a clean checkout. That file is
  // deliberately not committed — licence terms are the author's to honour, and
  // redistributing someone's track through a public repo is not covered by
  // "free to use in your video".
  const supplied = join(root, 'assets', 'soundtrack.mp3')
  const useSupplied = existsSync(supplied)
  let audioInput = wav
  if (useSupplied) {
    audioInput = supplied
    console.log('using assets/soundtrack.mp3')
  } else {
    writeWav(wav, renderSoundtrack(duration))
    console.log('using the generated soundtrack (assets/soundtrack.mp3 not found)')
  }

  // Trimmed to length, with a fade at each end: a track cut mid-phrase at the
  // last frame sounds like the file broke.
  const fadeStart = Math.max(0, duration - 2.2)
  const filters = [
    `atrim=0:${duration.toFixed(3)}`,
    'asetpts=N/SR/TB',
    'afade=t=in:st=0:d=0.4',
    `afade=t=out:st=${fadeStart.toFixed(3)}:d=2.2`,
    'loudnorm=I=-15:TP=-1.5:LRA=11',
  ].join(',')

  run(['-i', source, '-i', audioInput,
       '-vf', 'scale=1280:800:flags=lanczos',
       '-af', filters,
       '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p',
       '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', mp4])
  run(['-i', source, '-vf',
       'fps=12,scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
       gif])

  rmSync(raw, { recursive: true, force: true })
  rmSync(extensionPath, { recursive: true, force: true })
  console.log(`\n${mp4}\n${gif}`)
}

await main()
