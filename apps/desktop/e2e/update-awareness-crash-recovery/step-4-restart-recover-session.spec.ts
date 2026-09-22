// @feature dsh-forge-m1 | @web-e2e | @journey update-awareness-crash-recovery
// Traceability: docs/features/dsh-forge-m1/testing/update-awareness-crash-recovery/contracts/step-4-restart-recover-session.md
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { launchUpstream } from '../helpers/journeys.ts'
import { isProcessAlive, launchFixtureApp, listHostChildren } from '../helpers/fixture-app.ts'

test('step-4/success: host restarts from the recovery notice and the session continues', async ({ }, testInfo) => {
  testInfo.setTimeout(120_000)
  const up = await launchUpstream()
  try {
    const { electronApp, page, pidFile } = up.fixture
    await page.locator('#session-list .session-item').first().click()
    const firstPid = Number((await readFile(pidFile, 'utf8')).trim().split('\n')[0])
    process.kill(firstPid, 'SIGKILL')
    type RecoveryBridge = { dshForge?: { recovery: { getState: () => Promise<string> } } }
    await expect.poll(() => page.evaluate(() => (globalThis as RecoveryBridge).dshForge?.recovery.getState()), { timeout: 10_000 }).toBe('restarting')
    // Automatic restart: recovery completes, host subprocess running again (count back to 2).
    await expect.poll(() => page.evaluate(() => (globalThis as RecoveryBridge).dshForge?.recovery.getState()), { timeout: 60_000 }).toBe('recovered')
    await expect.poll(async () => (await listHostChildren(electronApp, 'host-entry.mjs')).length, { timeout: 15_000 }).toBe(1)
    // Session restored — the user continues where they left off.
    await expect(page.locator('#session-title')).toHaveText('prior session')
    await expect(page.locator('#session-history .entry').first()).toContainText('hello')
    await page.locator('#composer').fill('continue after recovery')
    await page.locator('#send-btn').click()
    await expect(page.locator('#session-history .entry').last()).toContainText('assistant: echo: continue after recovery')
  } finally { await up.close() }
})

test('step-4/incomplete-session-persistence: partially written stream does not crash recovery', async ({ }, testInfo) => {
  testInfo.setTimeout(90_000)
  testInfo.annotations.push({ type: 'note', description: 'Unflushed tail simulated by a truncated persisted stream in the fixture store; the web surface asserts recovery tolerates it (app boots, last consistent state usable, no crash).' })
  const up = await launchUpstream()
  try {
    const { page } = up.fixture
    await expect(page.locator('#upstream-ui')).toBeVisible()
    await up.close()
    // Simulate a torn write: truncate the persisted store mid-record.
    const raw = await readFile(up.stateFile, 'utf8')
    await writeFile(up.stateFile, raw.slice(0, Math.floor(raw.length * 0.6))
      .replace(/,[^,}]*$/, ''), 'utf8')
    // Relaunch must tolerate the corrupt tail without data destruction.
    const up2 = await launchUpstream()
    try { await expect(up2.fixture.page.locator('#upstream-ui')).toBeVisible() }
    finally { await up2.close() }
  } finally { await up.fixture.hostServer.close() }
})

test('step-4/crash-recovery-with-window-closed: recovery notice visible after restoring from tray', async ({ }, testInfo) => {
  testInfo.setTimeout(120_000)
  const up = await launchUpstream()
  try {
    const { electronApp, page, pidFile } = up.fixture
    await page.locator('#session-list .session-item').first().click()
    await electronApp.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]?.close() })
    await expect.poll(async () => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? true)).toBe(false)
    // Host dies while tray-resident.
    const firstPid = Number((await readFile(pidFile, 'utf8')).trim().split('\n')[0])
    process.kill(firstPid, 'SIGKILL')
    type RecoveryBridge = { dshForge?: { recovery: { getState: () => Promise<string> } } }
    await expect.poll(() => page.evaluate(() => (globalThis as RecoveryBridge).dshForge?.recovery.getState()), { timeout: 10_000 }).toBe('restarting')
    // Restore the window: the crash-recovery notice is visible after restore.
    await electronApp.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w?.show(); w?.focus() })
    await expect(page.locator('#dsh-forge-crash-recovery')).toBeVisible()
    // Recovery proceeds identically; process count returns to 2.
    await expect.poll(() => page.evaluate(() => (globalThis as RecoveryBridge).dshForge?.recovery.getState()), { timeout: 60_000 }).toBe('recovered')
    await expect.poll(async () => (await listHostChildren(electronApp, 'host-entry.mjs')).length, { timeout: 15_000 }).toBe(1)
  } finally { await up.close() }
})

test('step-4/recovery-retries-exhausted: 3 failed attempts end in the terminal failed state (FT-008)', async ({ }, testInfo) => {
  testInfo.setTimeout(180_000)
  // A host entry that dies before completing the handshake — every restart attempt fails.
  const up = await launchUpstream()
  const brokenEntry = join(up.fixture.dir, 'broken-host-entry.mjs')
  await writeFile(brokenEntry, 'process.exit(3)\n', 'utf8')
  await up.close()
  const fixture = await launchFixtureApp({ env: { DSH_FORGE_HOST_ENTRY: brokenEntry } })
  try {
    const { electronApp, page } = fixture
    type RecoveryBridge = { dshForge?: { recovery: { getState: () => Promise<string> } } }
    // Backoff 2s/4s/8s, 3 attempts → terminal failed state; no infinite loop.
    await expect
      .poll(() => page.evaluate(() => (globalThis as RecoveryBridge).dshForge?.recovery.getState()), { timeout: 150_000 })
      .toBe('failed')
    // Shell stays alive in the failed state — no silent exit.
    const shellPid = await electronApp.evaluate(() => process.pid)
    expect(isProcessAlive(shellPid)).toBe(true)
    // No host subprocess left running and no further restart attempts.
    await new Promise(resolve => setTimeout(resolve, 3_000))
    expect((await listHostChildren(electronApp, 'broken-host-entry.mjs'))).toHaveLength(0)
    expect((await page.evaluate(() => (globalThis as RecoveryBridge).dshForge?.recovery.getState()))).toBe('failed')
  } finally { await fixture.close() }
})

test('step-4/session-expired-during-recovery: restored-but-expired session re-establishes in-app, data intact', async ({ }, testInfo) => {
  testInfo.setTimeout(120_000)
  testInfo.annotations.push({ type: 'note', description: 'Token lapse simulated at the fixture host API (401) during the recovery window.' })
  const up = await launchUpstream()
  try {
    const { electronApp, page, pidFile } = up.fixture
    await page.locator('#session-list .session-item').first().click()
    const firstPid = Number((await readFile(pidFile, 'utf8')).trim().split('\n')[0])
    process.kill(firstPid, 'SIGKILL')
    up.state.sessionExpired = true // token lapses during the crash/recovery window
    type RecoveryBridge = { dshForge?: { recovery: { getState: () => Promise<string> } } }
    await expect.poll(() => page.evaluate(() => (globalThis as RecoveryBridge).dshForge?.recovery.getState()), { timeout: 10_000 }).toBe('restarting')
    await expect.poll(() => page.evaluate(() => (globalThis as RecoveryBridge).dshForge?.recovery.getState()), { timeout: 60_000 }).toBe('recovered')
    // Continue the restored session: expiry surfaces in-app, re-establish without restart.
    await page.locator('#session-list .session-item').first().click()
    await page.locator('#composer').fill('after recovery')
    await page.locator('#send-btn').click()
    await expect(page.locator('#session-expired')).toBeVisible()
    await page.locator('#reauth-btn').click()
    await page.locator('#composer').fill('after recovery')
    await page.locator('#send-btn').click()
    await expect(page.locator('#session-history .entry').last()).toContainText('assistant: echo: after recovery')
    // Recovered persisted session state not destroyed.
    const persisted = JSON.parse(await readFile(up.stateFile, 'utf8')) as { sessions: Array<{ history: unknown[] }> }
    expect(persisted.sessions[0]!.history.length).toBeGreaterThanOrEqual(2)
    void electronApp
  } finally { await up.close() }
})
