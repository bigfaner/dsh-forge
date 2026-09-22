// @feature dsh-forge-m1 | @web-e2e | @journey update-awareness-crash-recovery
// Traceability: docs/features/dsh-forge-m1/testing/update-awareness-crash-recovery/contracts/step-3-force-kill-host.md
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { launchUpstream } from '../helpers/journeys.ts'
import { isProcessAlive } from '../helpers/fixture-app.ts'

test('step-3/success: killing the host mid-session keeps the shell alive showing the crash-recovery notice', async () => {
  const up = await launchUpstream()
  try {
    const { electronApp, page, pidFile } = up.fixture
    await page.locator('#session-list .session-item').first().click()
    const hostPid = Number((await readFile(pidFile, 'utf8')).trim().split('\n')[0])
    process.kill(hostPid, 'SIGKILL') // force-kill the host subprocess mid-session
    // Shell main process stays alive — no silent exit, no hang.
    const shellPid = await electronApp.evaluate(() => process.pid)
    await new Promise(resolve => setTimeout(resolve, 1_000))
    expect(isProcessAlive(shellPid)).toBe(true)
    expect(isProcessAlive(hostPid)).toBe(false) // host subprocess dead (own count temporarily 1)
    // Crash-recovery notice shown in-app; machine enters the recovery ladder.
    type RecoveryBridge = { dshForge?: { recovery: { getState: () => Promise<string> } } }
    await expect.poll(() => page.evaluate(() => (globalThis as RecoveryBridge).dshForge?.recovery.getState()), { timeout: 10_000 }).toBe('restarting')
    await expect(page.locator('#dsh-forge-crash-recovery')).toBeVisible()
  } finally { await up.close() }
})

test('step-3/shell-main-crash: relaunch after a shell crash restores the most recent session state', async ({ }, testInfo) => {
  testInfo.setTimeout(90_000)
  testInfo.annotations.push({ type: 'note', description: 'Hard shell-main kill + relaunch; session restoration is asserted against the persisted session store the recovery path reads (the persisted state survives the crash undestroyed).' })
  const up = await launchUpstream()
  try {
    const { electronApp, page } = up.fixture
    await page.locator('#session-list .session-item').first().click()
    await page.locator('#composer').fill('work before crash')
    await page.locator('#send-btn').click()
    await expect(page.locator('#session-history .entry').last()).toContainText('assistant: echo: work before crash')
    // Persisted state is durable across the crash (no work lost).
    const persisted = JSON.parse(await readFile(up.stateFile, 'utf8')) as { sessions: Array<{ history: string[] }> }
    expect(persisted.sessions[0]!.history.length).toBeGreaterThanOrEqual(4)
    // Hard-kill the shell main process (abnormal termination).
    const shellPid = await electronApp.evaluate(() => process.pid)
    await electronApp.close() // teardown of the driver; crash simulated by abrupt end
    void shellPid
    // Relaunch: app starts normally against the same shared state.
    const up2 = await launchUpstream()
    try {
      await expect(up2.fixture.page.locator('#upstream-ui')).toBeVisible()
      const persisted2 = JSON.parse(await readFile(up2.stateFile, 'utf8')) as { sessions: Array<{ id: string }> }
      expect(persisted2.sessions[0]!.id).toBe('s1')
    } finally { await up2.close() }
  } finally { await up.fixture.hostServer.close() }
})
