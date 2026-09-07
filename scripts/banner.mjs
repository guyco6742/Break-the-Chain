/**
 * Renders the 2048x1152 YouTube channel banner.
 *
 *   node scripts/banner.mjs          # the banner
 *   BANNER_GUIDES=1 node scripts/banner.mjs   # same, with the safe area drawn
 *
 * YouTube crops this image differently on every surface. Television shows all
 * 2048x1152; desktop shows a wide letterbox; phones show only a 1235x338 box in
 * the middle. Anything that must be read — the name, the tagline, the mark —
 * lives inside that box. Everything outside it is scenery that may be cut.
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'store-assets')
const W = 2048
const H = 1152
const SAFE = { w: 1235, h: 338 }
const guides = process.env.BANNER_GUIDES === '1'

/** Scattered link pills, as if a scan were running across the background. */
const scatter = () => {
  const colours = ['#4ac97e', '#e84d4d', '#2563c9', '#f0a24a']
  const pills = []
  let seed = 7
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31
    return seed / 2 ** 31
  }
  for (let i = 0; i < 46; i++) {
    const x = rand() * (W + 200) - 100
    const y = rand() * (H + 120) - 60
    // Keep the middle clear so the wordmark never fights the scenery.
    const centred = Math.abs(x - W / 2) < SAFE.w / 2 + 90 && Math.abs(y - H / 2) < SAFE.h / 2 + 70
    if (centred) continue
    const w = 90 + rand() * 200
    const colour = colours[Math.floor(rand() * colours.length)]
    const alpha = 0.1 + rand() * 0.2
    pills.push(
      `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:34px;
        border:2px solid ${colour};border-radius:7px;opacity:${alpha.toFixed(2)}"></div>`,
    )
  }
  return pills.join('')
}

const html = `<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0}
  body{
    width:${W}px;height:${H}px;overflow:hidden;position:relative;
    background:
      radial-gradient(58% 70% at 50% 50%, #1d2942 0%, transparent 68%),
      radial-gradient(48% 60% at 6% 0%, #23203a 0%, transparent 60%),
      radial-gradient(46% 62% at 96% 100%, #2a1b2c 0%, transparent 62%),
      #0a0d13;
    font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    color:#e7eaf0;
  }
  .scatter{position:absolute;inset:0;filter:blur(.3px)}
  .vignette{position:absolute;inset:0;background:radial-gradient(52% 58% at 50% 50%, rgba(10,13,19,.92) 0%, rgba(10,13,19,.55) 45%, transparent 72%)}
  .safe{
    position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
    width:${SAFE.w}px;height:${SAFE.h}px;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
  }
  .mark{display:flex;gap:16px;align-items:center;margin-bottom:22px}
  .mark i{display:block;width:64px;height:38px;border-radius:19px}
  .mark .a{border:7px solid #4ac97e}
  .mark .b{border:7px solid #e84d4d}
  h1{margin:0;font-size:98px;line-height:1;letter-spacing:-2.6px;font-weight:800;white-space:nowrap}
  .tag{margin:22px 0 0;font-size:33px;font-weight:700;color:#f0a24a;white-space:nowrap}
  .sub{margin:14px 0 0;font-size:24px;color:#8f9cb0;font-weight:500;white-space:nowrap}
  .guide{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
    width:${SAFE.w}px;height:${SAFE.h}px;border:3px dashed #ff00aa;pointer-events:none}
  .guide-label{position:absolute;left:50%;top:calc(50% + ${SAFE.h / 2}px + 14px);transform:translateX(-50%);
    color:#ff00aa;font-size:22px;font-weight:700}
</style>
<div class="scatter">${scatter()}</div>
<div class="vignette"></div>
<div class="safe">
  <div class="mark"><i class="a"></i><i class="b"></i></div>
  <h1>Break the Chain</h1>
  <p class="tag">Broken links, dead anchors and redirect chains — found</p>
  <p class="sub">A free, open-source Chrome extension</p>
</div>
${guides ? `<div class="guide"></div><div class="guide-label">safe area — 1235 × 338, all that phones show</div>` : ''}`

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
})
const page = await browser.newPage({ viewport: { width: W, height: H } })
await page.setContent(html)
await page.waitForTimeout(300)
mkdirSync(out, { recursive: true })
const file = join(out, guides ? 'youtube-banner-guides.png' : 'youtube-banner-2048x1152.png')
await page.screenshot({ path: file })
await browser.close()
console.log(file)
