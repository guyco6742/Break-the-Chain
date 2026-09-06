/**
 * Packages dist/ for the Chrome Web Store, on any platform.
 *
 * The obvious `cd dist && zip -r ../out.zip .` needs the `zip` binary, which
 * Windows does not ship. This picks whatever the machine actually has and
 * always produces the same layout: manifest.json at the root of the archive,
 * not inside a dist/ folder, which is what the store requires.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, rmSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const target = join(root, `break-the-chain-v${version}.zip`)

if (!existsSync(join(dist, 'manifest.json'))) {
  console.error('dist/manifest.json is missing — run `npm run build` first.')
  process.exit(1)
}
rmSync(target, { force: true })

const run = (command, args, cwd) => spawnSync(command, args, { cwd, stdio: 'inherit', shell: false })

let result
if (process.platform === 'win32') {
  // -Path dist\* packs the contents; -Path dist would nest everything a level deeper.
  result = run('powershell', [
    '-NoProfile', '-NonInteractive', '-Command',
    `Compress-Archive -Path '${dist}\\*' -DestinationPath '${target}' -Force`,
  ])
} else {
  result = run('zip', ['-r', target, '.', '-x', '.*'], dist)
}

if (result.error || result.status !== 0) {
  console.error('Packaging failed.', result.error?.message ?? `exit code ${result.status}`)
  process.exit(1)
}
console.log(`\nPackaged ${target}`)
console.log('Upload this file at https://chrome.google.com/webstore/devconsole')
