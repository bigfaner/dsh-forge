// S1 spike: thin Electron host running a dsh profile via the public npm stack.
// SPIKE CODE ONLY — per task 1.1 Hard Rules this must NOT evolve into the 1.4 host.
// Roles: ELECTRON_RUN_AS_NODE=1 → pure-Node boot child (official Desktop shape);
//        otherwise → Electron main (tries direct in-main boot first).
// Env:   S1_MODE=auto|direct|child  S1_USER_LAYER=off (pure official composition)
//        S1_AUTO_EXIT=1 (quit shortly after the window renders)
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PROFILE_DIR = join(HERE, 'profile')
const INSTALL_ANCHOR = join(HERE, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
const MODE = process.env.S1_MODE ?? 'auto'
const USER_LAYER = process.env.S1_USER_LAYER !== 'off'
const log = (m) => { console.log(`[S1] ${m}`) }
process.env.DSH_HOME ??= join(HERE, '.dsh-home')
log(`mode=${MODE} userLayer=${USER_LAYER ? 'on' : 'off'} runtime=${process.versions.electron ? `electron ${process.versions.electron}` : `node ${process.version}`}`)

async function bootProfile() {
  const boot = await import('@deepseek-ai/dsh-app-boot')
  const { runProfile } = await import('@deepseek-ai/dsh/profile-boot')
  const profile = boot.loadProfileDirectory('dsh', PROFILE_DIR, INSTALL_ANCHOR, USER_LAYER ? {} : { userLayer: false })
  boot.reportSkippedBundles('dsh', profile)
  log(`profile loaded: layers=${profile.layers.map((l) => l.packageName).join(' + ')} userPatches=${profile.patches.length} skipped=${profile.skippedBundles.length}`)
  const { ctx } = await runProfile({
    environment: boot.loadLayeredEnv('dsh'),
    profile: 'web',
    resolvedProfile: { profile, installAnchor: INSTALL_ANCHOR },
    patchFiles: [],
    args: ['--no-open', '--port', '19387'],
  })
  const url = ctx.connection.authenticatedUrl(`http://127.0.0.1:${ctx.webServer.port}`)
  return { url, injections: ctx.webServer.collectIndexInjections() }
}

if (process.env.ELECTRON_RUN_AS_NODE === '1') {
  try {
    const ready = await bootProfile()
    process.send?.({ type: 'ready', ...ready })
  } catch (error) {
    process.send?.({ type: 'fatal', message: String(error?.stack ?? error) })
    process.exitCode = 1
  }
} else {
  // Electron ESM main pitfall: top-level await on whenReady() deadlocks (Electron
  // defers 'ready' until ESM entry evaluation completes) — boot must run inside
  // an async main() invoked without top-level await.
  const { app, BrowserWindow } = await import('electron')
  let child
  const watchdog = setTimeout(() => { log('SPIKE FAILED: watchdog timeout (180s)'); app.exit(3) }, 180_000)
  const bootViaChild = () => new Promise((resolve, reject) => {
    child = spawn(process.execPath, ['--expose-internals', fileURLToPath(import.meta.url)], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    })
    child.on('message', (m) => { if (m?.type === 'ready') resolve({ via: 'child', ...m }); else if (m?.type === 'fatal') reject(new Error(m.message)) })
    child.once('close', (code) => reject(new Error(`boot child exited code=${code}`)))
    child.once('error', reject)
  })
  const tryDirect = async () => {
    try { return { via: 'direct', ...(await bootProfile()) } } catch (error) {
      log(`DIRECT-IN-MAIN VERDICT: FAILED — ${String(error?.message ?? error)}`)
      return undefined
    }
  }
  void (async () => {
    try {
      await app.whenReady()
      let ready
      if (MODE !== 'child') { log('DIRECT-IN-MAIN VERDICT: attempting boot inside Electron main…'); ready = await tryDirect() }
      if (ready === undefined && MODE !== 'direct') { log('falling back to ELECTRON_RUN_AS_NODE child boot (official Desktop shape)…'); ready = await bootViaChild() }
      if (ready === undefined) throw new Error('direct boot failed and child fallback disabled (S1_MODE=direct)')
      log(`BOOT READY via=${ready.via}`)
      const win = new BrowserWindow({ width: 1440, height: 900, title: 'dsh-forge S1 spike' })
      await win.loadURL(ready.url)
      log(`WINDOW did-finish-load url=${ready.url}`)
      log(`INJECTIONS count=${ready.injections?.length ?? 0} sample=${JSON.stringify(ready.injections?.[0]) ?? 'none'}`)
      if (process.env.S1_AUTO_EXIT === '1') setTimeout(() => { log('SPIKE SUCCESS — auto exit'); app.quit() }, 2_500)
    } catch (error) {
      log(`SPIKE FAILED: ${String(error?.stack ?? error)}`)
      app.exit(1)
    } finally { clearTimeout(watchdog) }
  })()
  app.on('before-quit', () => { child?.kill() })
}
