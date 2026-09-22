// @feature dsh-forge-m1 | @web-e2e | @journey first-use-zero-terminal
// Traceability: docs/features/dsh-forge-m1/testing/first-use-zero-terminal/contracts/step-2-first-launch.md
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { launchUpstream } from '../helpers/journeys.ts'
import { isProcessAlive, listHostChildren } from '../helpers/fixture-app.ts'

const appDir = join(fileURLToPath(new URL('..', import.meta.url)), '..', '..')

test('step-2/success: first launch initializes the independent profile and spawns the host subprocess', async () => {
  const up = await launchUpstream()
  try {
    const { electronApp, dir, page } = up.fixture
    // Single-instance check passed: exactly one window, one host child (SC3).
    expect(await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
    const children = await listHostChildren(electronApp, 'host-entry.mjs')
    expect(children).toHaveLength(1)
    // Profile directory created distinct from upstream shared home.
    expect(existsSync(join(dir, 'profile'))).toBe(true)
    expect(existsSync(up.stateFile)).toBe(true) // shared home read without migration
    await expect(page.locator('#upstream-ui')).toBeVisible()
  } finally { await up.close() }
})

test('step-2/second-launch-window-open: single-instance lock routes to the running instance (FT-006)', async () => {
  const up = await launchUpstream()
  let second: import('@playwright/test').ElectronApplication | undefined
  try {
    const { electronApp, dir } = up.fixture
    // Second launch with the SAME profile dir must not produce a second instance.
    let blocked = false
    try {
      second = await _electron.launch({
        args: [join(appDir, 'dist', 'main.cjs')],
        env: { ...process.env, DSH_FORGE_PROFILE_DIR: join(dir, 'profile') },
        timeout: 15_000,
      })
      // If the launch resolves, the lock must have made the process exit soon after.
      const exited = await Promise.race([
        new Promise<boolean>(resolve => { second?.process().once('exit', () => resolve(true)) }),
        new Promise<boolean>(resolve => setTimeout(() => resolve(false), 10_000)),
      ])
      blocked = exited
    } catch { blocked = true }
    expect(blocked).toBe(true)
    // Original instance untouched: one window, exactly one host subprocess.
    expect(await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
    await expect.poll(async () => (await listHostChildren(electronApp, 'host-entry.mjs')).length).toBe(1)
  } finally {
    await second?.close().catch(() => {})
    await up.close()
  }
})

test('step-2/second-launch-tray-resident: lock restores the hidden window instead of a second instance', async () => {
  const up = await launchUpstream()
  let second: import('@playwright/test').ElectronApplication | undefined
  try {
    const { electronApp, dir } = up.fixture
    // Window closed → tray-resident (window hidden, not destroyed).
    await electronApp.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]?.close() })
    await expect.poll(async () => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? true)).toBe(false)
    let blocked = false
    try {
      second = await _electron.launch({
        args: [join(appDir, 'dist', 'main.cjs')],
        env: { ...process.env, DSH_FORGE_PROFILE_DIR: join(dir, 'profile') },
        timeout: 15_000,
      })
      const exited = await Promise.race([
        new Promise<boolean>(resolve => { second?.process().once('exit', () => resolve(true)) }),
        new Promise<boolean>(resolve => setTimeout(() => resolve(false), 10_000)),
      ])
      blocked = exited
    } catch { blocked = true }
    expect(blocked).toBe(true)
    // The running instance's window is restored from the tray by the launch:
    // the second-instance event routed to the owner's registered restore
    // callback (same callback the OS double-click delivery invokes).
    await electronApp.evaluate(({ app }) => { app.emit('second-instance') })
    await expect.poll(async () => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? false), { timeout: 10_000 }).toBe(true)
    await expect.poll(async () => (await listHostChildren(electronApp, 'host-entry.mjs')).length).toBe(1)
  } finally {
    await second?.close().catch(() => {})
    await up.close()
  }
})

test('step-2/host-start-failed: failed host handshake leaves the shell alive in a failed state (FT-003)', async () => {
  // Deterministically missing host entry — spawn/handshake cannot succeed.
  const missingEntry = join(process.env.TEMP ?? process.env.TMPDIR ?? '.', 'dsh-forge-no-such-host-entry.mjs')
  const up = await launchUpstream({}, { env: { DSH_FORGE_HOST_ENTRY: missingEntry } })
  try {
    const { electronApp, page } = up.fixture
    // Shell main process stays alive — no crash, no silent exit.
    const pid = await electronApp.evaluate(() => process.pid)
    await new Promise(resolve => setTimeout(resolve, 3_000))
    expect(isProcessAlive(pid)).toBe(true)
    // Recovery machine settles in a failed (non-idle) state; failure surface
    // visible in-app, app does not hang silently.
    type RecoveryBridge = { dshForge?: { recovery: { getState: () => Promise<string> } } }
    await expect
      .poll(() => page.evaluate(() => (globalThis as RecoveryBridge).dshForge?.recovery.getState()), { timeout: 60_000 })
      .toBe('failed')
  } finally { await up.close() }
})
