/** Panel styles live in a shadow root, so nothing here can leak into the page. */
export const PANEL_CSS = `
:host { all: initial; }
:host { --accent: #f0a24a; }
* { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.wrap {
  /* The corner lives here as well as in place(), so the panel can never end up
     in the page flow if settings fail to load. */
  position: fixed; inset: auto 16px 16px auto;
  z-index: 2147483647; width: 340px; max-height: 70vh;
  display: flex; flex-direction: column; background: #12151c; color: #e7eaf0;
  border: 1px solid #2b313d; border-radius: 12px; overflow: hidden;
  box-shadow: 0 12px 40px rgba(0,0,0,.45); font-size: 13px; line-height: 1.45;
}
.hdr { display: flex; align-items: center; gap: 8px; padding: 9px 10px; background: #171b24; cursor: move; user-select: none; }
.hdr .name { font-weight: 650; letter-spacing: .2px; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hdr button { background: none; border: 0; color: var(--accent); cursor: pointer; font-size: 15px; padding: 2px 5px; border-radius: 5px; }
.hdr button:hover { background: #232936; color: #fff; }
.hdr button.corner { font-size: 17px; line-height: 1; }
.chips { display: flex; flex-wrap: wrap; gap: 5px; padding: 8px 10px; border-bottom: 1px solid #232936; }
.chip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 999px; font-size: 11.5px; font-weight: 600; background: #1b2029; border: 1px solid #3a3f4d; color: var(--accent); cursor: pointer; }
.chip[aria-pressed="true"] { outline: 1px solid var(--accent); }
.chip .dot { width: 8px; height: 8px; border-radius: 50%; }
.bar { height: 3px; background: #232936; }
.bar > i { display: block; height: 100%; background: var(--accent); width: 0; transition: width .2s; }
.list { overflow: auto; flex: 1; padding: 4px 0; }
.row { display: block; padding: 7px 10px; border-bottom: 1px solid #1b2029; cursor: pointer; }
.row:hover { background: #171b24; }
.row .top { display: flex; gap: 6px; align-items: center; }
.row .code { font-variant-numeric: tabular-nums; font-weight: 700; font-size: 11.5px; padding: 1px 6px; border-radius: 4px; color: #fff; }
.row .txt { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #cfd6e4; }
.row .url { display: block; color: #7c879b; font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: ltr; }
.empty { padding: 18px 12px; text-align: center; color: #7c879b; }
.ftr { display: flex; gap: 6px; padding: 8px 10px; border-top: 1px solid #232936; background: #171b24; }
.ftr button { flex: 1; padding: 6px 8px; border-radius: 7px; border: 1px solid #3a3f4d; background: #1b2029; color: var(--accent); font-weight: 600; font-size: 12px; cursor: pointer; }
.ftr button:hover { background: #232936; }
.ftr button:disabled { opacity: .4; color: #8a94a6; cursor: default; }
.min .chips, .min .list, .min .ftr, .min .bar { display: none; }
`

/** Styles injected into the page itself, to mark up the links. */
export function pageCss(colors: Record<string, string>, showBadges: boolean): string {
  const badge = showBadges
    ? `
[data-btc-status]::after {
  content: attr(data-btc-status);
  font-size: 10px; font-weight: 700; line-height: 1; vertical-align: super;
  margin-inline-start: 3px; padding: 1px 3px; border-radius: 3px;
  background: rgba(0,0,0,.55); color: #fff; font-family: monospace; direction: ltr;
}`
    : ''
  return `
[data-btc-cat="valid"]    { outline: 2px solid ${colors.valid} !important; outline-offset: 1px; }
[data-btc-cat="redirect"] { outline: 2px solid ${colors.redirect} !important; outline-offset: 1px; }
[data-btc-cat="warning"]  { outline: 2px solid ${colors.warning} !important; outline-offset: 1px; }
[data-btc-cat="invalid"]  { outline: 2px solid ${colors.invalid} !important; outline-offset: 1px; background: ${colors.invalid}22 !important; }
[data-btc-cat="empty"]    { outline: 2px dashed ${colors.warning} !important; outline-offset: 1px; }
[data-btc-cat="excluded"] { outline: 1px dotted ${colors.excluded} !important; outline-offset: 1px; }
[data-btc-flash] { animation: btc-flash 1.1s ease-out 2; }
@keyframes btc-flash { 0%,100% { box-shadow: none } 50% { box-shadow: 0 0 0 6px ${colors.invalid}66 } }
${badge}
`
}
