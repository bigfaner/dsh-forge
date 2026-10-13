// boot 分段计时探针：launch → firstWindow → bootReady → loaderLive → workbench → dismiss → stablePhase → close
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchElectron, ROOT } from '../../e2e/support/launch.js'

const t0 = Date.now()
const mark = (label) => console.log(`${String(Date.now() - t0).padStart(6)}ms  ${label}`)

const userData = mkdtempSync(join(tmpdir(), 'dsh-e2e-bootprobe-'))
const app = await launchElectron({
  env: { DSH_FORGE_DEV_PROFILE: 'dev', DSH_FORGE_USER_DATA: userData, DSH_FORGE_DIRECTORY_PICKER: 'off' },
})
mark('electron.launch resolved')
const page = await app.firstWindow({ timeout: 60_000 })
mark('firstWindow')
await page.waitForFunction(() => (globalThis).__DSH_BOOT_READY__ !== undefined, undefined, { timeout: 60_000 })
mark('bootReady')
await page.waitForFunction(() => {
  const g = globalThis
  return g.__ModuleLoader__?.mode === 'live' && g.__DSH_FORGE_CLIENT__ !== undefined
}, undefined, { timeout: 90_000 })
mark('loaderLive + client')
await page.waitForSelector('[data-dswf-workbench]', { timeout: 60_000 })
mark('workbench visible')
const t1 = Date.now()
await page.waitForFunction(() => {
  const p = document.querySelector('[data-dswf-workbench]')?.getAttribute('data-dswf-phase')
  return p === 'hero' || p === 'session'
}, undefined, { timeout: 60_000 })
mark(`phase settled (waited ${Date.now() - t1}ms)`)
const proc = app.process()
await app.close().catch(() => undefined)
mark('close issued')
await new Promise((r) => { const t = setTimeout(r, 10_000); proc.once('exit', () => { clearTimeout(t); r() }) })
mark('process exited')
await new Promise((r) => setTimeout(r, 2000))
mark('done (incl 2s settle)')
console.log('ROOT=' + ROOT)
