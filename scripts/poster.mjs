/**
 * Renders the vertical 1152x2048 poster for YouTube (Shorts cover / channel art).
 *
 *   node scripts/poster.mjs
 *
 * The screenshot in the middle is the real one from store-assets, so the poster
 * cannot drift from what the extension actually looks like.
 */
import { chromium } from '@playwright/test'
import { readFileSync, mkdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'store-assets')
const W = 1152
const H = 2048

/**
 * Two zoomed crops rather than one shrunken page: at poster width the status
 * badges and colours — the entire point of the picture — disappear, and one
 * card alone left a dead band down the middle of the layout.
 */
const crop = (name, box) => {
  const file = join(out, name)
  const tmp = join(out, `.crop-${name}`)
  const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file,
    '-vf', `crop=${box.w}:${box.h}:${box.x}:${box.y}`, tmp])
  if (result.status !== 0) throw new Error(`could not crop ${name}`)
  const data = readFileSync(tmp).toString('base64')
  rmSync(tmp, { force: true })
  return data
}
const shotPage = crop('screenshot-1-scan.png', { x: 272, y: 104, w: 1000, h: 560 })
const shotReport = crop('screenshot-2-report.png', { x: 14, y: 120, w: 1106, h: 450 })

const html = `<!doctype html><meta charset="utf-8">
<style>
  @import url('');
  html,body{margin:0;padding:0}
  body{
    width:${W}px;height:${H}px;overflow:hidden;position:relative;
    background:
      radial-gradient(90% 55% at 50% -8%, #24304a 0%, transparent 62%),
      radial-gradient(70% 45% at 8% 104%, #2a1c2e 0%, transparent 60%),
      #0b0e14;
    color:#e7eaf0;
    font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    display:flex;flex-direction:column;align-items:center;
    padding:96px 72px 72px;box-sizing:border-box;
  }
  .mark{display:flex;gap:22px;align-items:center;margin-bottom:44px}
  .mark i{display:block;width:86px;height:52px;border-radius:26px}
  .mark .a{border:9px solid #4ac97e}
  .mark .b{border:9px solid #e84d4d}
  h1{font-size:112px;line-height:.98;margin:0;letter-spacing:-3px;font-weight:800;text-align:center}
  .tag{font-size:35px;line-height:1.3;margin:30px 0 0;color:#f0a24a;font-weight:700;text-align:center;max-width:940px}
  .sub{font-size:25px;margin:22px 0 0;color:#93a0b4;text-align:center;font-weight:500}

  .stack{margin:62px 0 auto;display:flex;flex-direction:column;gap:24px}
  .card{
    width:1008px;border-radius:20px;overflow:hidden;
    border:1px solid #2b3446;box-shadow:0 34px 80px rgba(0,0,0,.66);
    background:#12151c;
  }
  .card img{display:block;width:1008px}

  .facts{width:100%;display:flex;flex-direction:column;gap:28px;padding-top:56px}
  .fact{display:flex;align-items:center;gap:24px;font-size:33px;font-weight:600;color:#dfe5ee}
  .dot{width:20px;height:20px;border-radius:50%;flex:none}
  .foot{margin-top:54px;display:flex;gap:16px;flex-wrap:wrap;justify-content:center}
  .pill{
    font-size:24px;font-weight:700;padding:12px 26px;border-radius:999px;
    border:1px solid #333d52;color:#93a0b4;background:#12161f;
  }
  .pill.hot{color:#0d1017;background:#f0a24a;border-color:#f0a24a}
</style>
<div class="mark"><i class="a"></i><i class="b"></i></div>
<h1>Break<br>the Chain</h1>
<p class="tag">Find the links that quietly stopped working</p>
<p class="sub">A Chrome extension for broken links, dead anchors and redirect chains</p>

<div class="stack">
  <div class="card"><img src="data:image/png;base64,${shotPage}" alt=""></div>
  <div class="card"><img src="data:image/png;base64,${shotReport}" alt=""></div>
</div>

<div class="facts">
  <div class="fact"><span class="dot" style="background:#e84d4d"></span>404s, dead anchors, broken images</div>
  <div class="fact"><span class="dot" style="background:#2563c9"></span>Every hop of a redirect chain</div>
  <div class="fact"><span class="dot" style="background:#4ac97e"></span>One page, or crawl the whole site</div>
</div>

<div class="foot">
  <span class="pill hot">Free</span>
  <span class="pill">Open source</span>
  <span class="pill">No account</span>
  <span class="pill">Runs in your browser</span>
</div>`

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
})
const page = await browser.newPage({ viewport: { width: W, height: H } })
await page.setContent(html)
await page.waitForTimeout(400)
mkdirSync(out, { recursive: true })
const file = join(out, 'youtube-portrait-1152x2048.png')
await page.screenshot({ path: file })
await browser.close()
console.log(file)
