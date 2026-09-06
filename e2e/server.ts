import http from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * A tiny site with one of every failure mode the extension claims to find:
 * a 200, a 404, a 500, a three-hop redirect chain and a missing image.
 */
export function startFixtureServer(): Promise<{ origin: string; close: () => Promise<void> }> {
  // /rate-limited answers 429 the first time and 200 after that, so the test can
  // prove the back-off actually retries instead of reporting a false failure.
  let rateLimitHits = 0
  const server = http.createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0]
    const send = (status: number, body = '', headers: Record<string, string> = {}) => {
      res.writeHead(status, headers)
      res.end(body)
    }
    switch (url) {
      case '/':
      case '/index.html':
        return send(200, readFileSync(join(here, 'fixtures/index.html'), 'utf8'), {
          'content-type': 'text/html; charset=utf-8',
        })
      case '/ok':
        // A second page with its own anchors. The content script never runs
        // here, so these can only be resolved by the crawler's HTML parser.
        return send(
          200,
          `<!doctype html><html><body>
             <h2 id="second-anchor">Second page anchor</h2>
             <a href="#second-anchor">jump on the second page</a>
             <a href="#top">back to top</a>
             <a href="#not-here">dead anchor on the second page</a>
             <a href="/missing">broken from the second page</a>
           </body></html>`,
          { 'content-type': 'text/html; charset=utf-8' },
        )
      case '/missing':
      case '/missing.png':
      case '/shadow-missing':
        return send(404, 'nope')
      case '/rate-limited':
        rateLimitHits++
        return rateLimitHits === 1
          ? send(429, 'slow down', { 'retry-after': '1' })
          : send(200, 'fine now', { 'content-type': 'text/html' })
      case '/server-error':
        return send(500, 'boom')
      case '/hop1':
        return send(301, '', { location: '/hop2' })
      case '/hop2':
        return send(302, '', { location: '/hop3' })
      case '/hop3':
        return send(200, 'arrived', { 'content-type': 'text/html' })
      default:
        return send(404, 'nope')
    }
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      })
    })
  })
}
