import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, test, _electron, type ElectronApplication } from '@playwright/test'
import { spawnSync } from 'node:child_process'

// UF1 (task 4.2) e2e: close-to-tray residency + quit with no host orphans.
// Runs the built shell bundle (dist/main.cjs) the same way shell.spec.ts does.

async function launchShell(): Promise<ElectronApplication> {
  const appDir = join(fileURLToPath(new URL('..', import.meta.url)))
  return _electron.launch({ args: [join(appDir, 'dist', 'main.cjs')] })
}

test('closing the main window hides it (tray residency), not quit', async ({ }, testInfo) => {
  testInfo.setTimeout(60_000)
  const electronApp = await launchShell()
  await electronApp.firstWindow()

  // firstWindow resolves before ready-to-show; wait for the visible state
  // the residency assertion depends on.
  await expect.poll(async () => electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.isVisible() ?? false)).toBe(true)

  const before = await electronApp.evaluate(({ BrowserWindow }) => ({
    count: BrowserWindow.getAllWindows().length,
    visible: BrowserWindow.getAllWindows()[0]?.isVisible() ?? false,
  }))
  expect(before.count).toBe(1)
  expect(before.visible).toBe(true)

  // Playwright page.close() destroys an Electron window without the
  // user-facing 'close' event; drive BrowserWindow.close() in the main
  // process so the residency hook (preventDefault + hide) is exercised.
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.close()
  })

  const after = await electronApp.evaluate(({ BrowserWindow }) => ({
    count: BrowserWindow.getAllWindows().length,
    visible: BrowserWindow.getAllWindows()[0]?.isVisible() ?? false,
    destroyed: BrowserWindow.getAllWindows()[0]?.isDestroyed() ?? true,
  }))
  // SC5: window hidden but alive — the shell stays resident in the tray.
  expect(after.count).toBe(1)
  expect(after.destroyed).toBe(false)
  await expect.poll(async () => electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.isVisible() ?? true)).toBe(false)

  await electronApp.close()
})

test('quit terminates the shell without host orphans (SC3 footprint)', async ({ }, testInfo) => {
  testInfo.setTimeout(60_000)
  const electronApp = await launchShell()
  await electronApp.firstWindow()

  const pid = electronApp.process().pid
  await electronApp.close()

  // The shell main process must be gone once close() resolves.
  const probe = process.platform === 'win32'
    ? spawnSync('tasklist', ['/FI', `PID eq ${pid}`], { encoding: 'utf8' })
    : spawnSync('kill', ['-0', String(pid)], { encoding: 'utf8' })
  const alive = process.platform === 'win32'
    ? (probe.stdout ?? '').includes(String(pid))
    : probe.status === 0
  expect(alive).toBe(false)
})
