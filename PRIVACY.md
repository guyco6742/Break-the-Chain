# Privacy Policy — Break the Chain

**Last updated: 6 September 2026**

## The short version

Break the Chain does not collect, store, transmit or sell any of your data.
There is no server, no account, no analytics and no telemetry. Nothing you do
with this extension is visible to its author or to anyone else.

## What the extension does with your browsing

When you click **Scan this page**, the extension reads the links on that page
and sends an HTTP request to each one, directly from your browser, to find out
whether it still works. This is the same thing that would happen if you clicked
every link yourself, and it is the entire purpose of the extension.

Those requests go only to the sites the links point at. They do not pass through
any server belonging to the author. The extension is not told which sites you
visit, and has no way to report them anywhere.

Requests are sent with your browser's existing cookies, so that a link only you
can see is checked as *you* rather than as a stranger. Those cookies never leave
your browser and are never read by the extension.

## What is stored, and where

Two things are stored locally in your own browser:

- **Your settings** — which resource types to check, exclusion rules, colours,
  speed limits — in `chrome.storage.sync`. If you have Chrome Sync switched on,
  Chrome may sync these settings between your own devices, in the same way it
  syncs your bookmarks. That is between you and Chrome; the extension is not
  part of it.
- **The results of your last scan** — in `chrome.storage.session`. This is
  temporary storage that Chrome clears when you close the browser.

Both are readable only by this extension, on your machine. Neither is ever
uploaded.

## Permissions

The extension asks for permission to send requests to any site
(`<all_urls>`), because the links on a page can point anywhere and there is no
way to know where in advance. This permission is **optional**: installing the
extension does not grant it. It is requested from a button in the extension's
popup the first time you run a scan, and you can withdraw it at any time from
Chrome's extension settings.

## Changes

Any future version that changes what is described here will update this document
and say so in the release notes.

## Contact

Questions or concerns: https://github.com/guyco6742/Break-the-Chain/issues
