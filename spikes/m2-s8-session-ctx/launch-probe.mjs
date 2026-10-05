// S8 排障探针：最小复现 playwright _electron.launch —— 验证 env 假设
import { createRequire } from 'node:module'
const require = createRequire(process.cwd() + '/package.json')
const electronPath = createRequire(process.cwd() + '/apps/host/package.json')('electron')
console.log('[probe] ELECTRON_RUN_AS_NODE =', JSON.stringify(process.env.ELECTRON_RUN_AS_NODE))
console.log('[probe] electronPath =', electronPath)
const { _electron } = await import('playwright-core')
const app = await _electron.launch({
  executablePath: electronPath,
  args: ['.'],
  cwd: process.cwd() + '/apps/host',
  env: { ...process.env, DSH_FORGE_PORT: '49399' },
})
console.log('[probe] launched ok, windows =', app.windows().length)
await app.close()
console.log('[probe] closed')
