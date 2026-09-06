import { cpSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The shipped manifest asks for <all_urls> as an *optional* permission, which a
 * human grants by clicking a button in the popup. A headless test can't click a
 * Chrome permission prompt, so the e2e run uses a copy of the build with that
 * permission pre-granted. Nothing else differs.
 */
export function buildTestExtension(root: string): string {
  const src = join(root, 'dist')
  const out = join(root, '.dist-e2e')
  if (!existsSync(src)) throw new Error('Run `npm run build` before the e2e tests.')
  rmSync(out, { recursive: true, force: true })
  cpSync(src, out, { recursive: true })

  const manifestPath = join(out, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.host_permissions = ['<all_urls>']
  delete manifest.optional_host_permissions
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  return out
}
