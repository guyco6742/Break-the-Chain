# Chrome Web Store — Break the Chain

Single source of truth for the store listing. Copy-paste from here into the
Developer Dashboard. **Last updated: 2026-09-06 — v1.0.10**

> Exclude this file from the upload ZIP. `npm run zip` packages `dist/` only, so it already is.

---

## Listing

**Name:** Break the Chain

**Summary (132 char max, currently 124):**
> Find broken links, dead in-page anchors and redirect chains on any page — or crawl a whole site. Local, offline, no account.

**Category:** Developer Tools
**Language:** English

**Description:**

> Break the Chain finds the links on a page that quietly stopped working.
>
> Click the toolbar icon and it checks every link on the page you are looking at, then colours each one: green for fine, blue for a redirect, amber for needs-a-look, red for broken. A floating panel lists the failures, and clicking one jumps straight to it on the page.
>
> WHAT IT FINDS
> • Broken links — 404s, server errors, hosts that no longer resolve
> • Dead in-page anchors — a "Jump to pricing" link with no pricing section left to jump to
> • Redirect chains — every hop and its status code, including redirect loops
> • Broken images, and optionally scripts and stylesheets
> • Empty links — href="" and href="#" left behind by a template
>
> WHOLE-SITE CRAWL
> Point it at a site and it walks the pages for you, following your sitemap and respecting robots.txt, with limits you control for how deep and how many pages.
>
> BUILT TO AVOID FALSE ALARMS
> A link checker that cries wolf is worse than none. Sites that refuse automated requests are reported as warnings with an explanation, not as failures. When a server asks it to slow down, it slows down instead of hammering the site. Heading permalinks on GitHub and other documentation sites are understood rather than flagged.
>
> YOUR DATA STAYS WITH YOU
> Everything runs in your browser. No account, no sign-in, no server, no analytics, nothing uploaded anywhere. It works offline apart from the links it is checking.
>
> Results export to CSV and JSON. Free and open source (MIT).

**Homepage / support URL:** https://github.com/guyco6742/Break-the-Chain
**Privacy policy URL:** https://guyco6742.github.io/Break-the-Chain/privacy.html

---

## Single purpose

> Checking the links on web pages for problems — broken links, dead in-page anchors and redirect chains — and reporting the results to the user.

---

## Permissions justification

Every line below is written to be read by a reviewer who has never seen the code.
"Needed for the extension to work" is an automatic rejection.

| Permission | Justification |
|---|---|
| `activeTab` | Runs the link collector on the tab the user is looking at, only after they click the extension's button. Nothing runs on any page the user did not explicitly scan. |
| `scripting` | Injects that collector into the scanned tab on demand. The extension declares no automatically-injected content scripts. |
| `storage` | Saves the user's own settings (which resource types to check, exclusion rules, colours, speed limits) and holds the current scan's results so the report page can display them. Nothing is sent anywhere. |
| `offscreen` | A service worker has no DOM. Pages fetched during a whole-site crawl are parsed with a real HTML parser in an offscreen document, so links are read from actual markup rather than pattern-matched out of text. |
| `webRequest` | Used purely as an observer, with no blocking and no modification, to record the individual hops of a redirect chain. `fetch()` cannot expose them: it either hides the headers or collapses the whole chain into one final URL. Showing "301 → 302 → 200" instead of just "it redirects" is a core feature. |
| `declarativeNetRequestWithHostAccess` | Rewrites `Origin` and `Sec-Fetch-*` on **the extension's own** requests only (matched by `tabIds: [-1]`, meaning requests that come from no tab). Bot-protection layers in front of large sites answer a service-worker `fetch()` with 403 purely because of those headers, which makes working links look broken. No request the user makes while browsing is touched. |

### Host permissions

`<all_urls>` is declared as an **optional** host permission, not a required one.

> The extension needs to send a request to each link it finds, and those links can point anywhere, so the set of hosts cannot be known in advance. The permission is requested at runtime from a button in the extension's popup, the first time the user runs a scan, and the popup explains what it is for. Installing the extension grants it nothing.

---

## Privacy & data use

**Data collected: none.**

Certify in the dashboard's data-use form:

- [x] Does not collect or transmit personally identifiable information
- [x] Does not collect or transmit health information
- [x] Does not collect or transmit financial or payment information
- [x] Does not collect or transmit authentication information
- [x] Does not collect or transmit personal communications
- [x] Does not collect or transmit location
- [x] Does not collect or transmit web history — *scan results stay in `chrome.storage.session`, are visible only to the user, and are cleared when the browser closes*
- [x] Does not collect or transmit user activity
- [x] Does not collect or transmit website content
- [x] Not being sold to third parties
- [x] Not being used or transferred for purposes unrelated to the item's single purpose
- [x] Not being used or transferred to determine creditworthiness or for lending

**Remote code:** none. Every script ships inside the package; nothing is fetched and executed at runtime.

**Where requests go:** only to the URLs the user asked the extension to check, directly from their browser. There is no backend.

---

## Assets

| Asset | Size | Status |
|---|---|---|
| Store icon | 128×128 | ✅ `public/icons/128.png` |
| Screenshots | 1280×800, 1–5 | ✅ `store-assets/screenshot-1-scan.png`, `-2-report.png`, `-3-settings.png` |
| Small promo tile | 440×280 | ✅ `store-assets/promo-small-440x280.png` |
| Marquee promo tile | 1400×560 | ✅ `store-assets/promo-marquee-1400x560.png` |

Regenerate any of them with `npm run screenshots` — it drives the real built extension against a demo site, so they can never drift from what the extension actually looks like.

Screenshots worth taking: a page mid-scan with links coloured and the panel showing failures; the full report with a redirect chain expanded; the options page.

---

## Pre-submission checklist

- [x] Manifest V3, no V2 APIs
- [x] Every icon referenced exists at its stated pixel size
- [x] No `eval`, no inline scripts, no inline event handlers
- [x] No remote code
- [x] Service worker keeps no state that is lost when it is torn down
- [x] `description` within 132 characters
- [x] ZIP contains `manifest.json` at the root, and only `dist/` — produced by `npm run zip`, which works on Windows too
- [x] Privacy policy published at `docs/privacy.html` — GitHub Pages: Settings → Pages → Source **Deploy from a branch** → branch `main`, folder `/docs`. `docs/.nojekyll` keeps Pages from running the files through Jekyll.
- [x] Screenshots and promo tile produced
- [ ] Version bumped and `dist/` rebuilt (the e2e suite fails if `dist` is stale)

---

## Version history

| Version | Date | Change |
|---|---|---|
| 1.0.10 | 2026-09-06 | Result chips label statusless results correctly (a working `#anchor` said ERR on a green chip); store assets generated |
| 1.0.9 | 2026-09-06 | Scan state survives a service-worker restart; the scanned URL is passed from the popup instead of read from the tabs API |
| 1.0.8 | 2026-09-06 | Removed modulepreload tags from extension pages; e2e guard against a stale `dist` |
| 1.0.7 | 2026-09-06 | Resolve `user-content-` heading permalinks (GitHub, GitLab, markdown renderers) |
| 1.0.6 | 2026-09-06 | Crawler resolves in-page anchors instead of reporting them broken |
| 1.0.5 | 2026-09-06 | happy-dom replaces jsdom; CI runs on Node 20 and 22 |
| 1.0.4 | 2026-09-06 | 429 back-off with `Retry-After`; panel corner control; amber UI |
| 1.0.1 | 2026-09-06 | Browser-shaped request headers so bot-protected sites stop false-positiving |
| 1.0.0 | 2026-09-06 | First build |
