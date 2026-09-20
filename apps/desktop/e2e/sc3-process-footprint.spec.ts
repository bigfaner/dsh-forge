// SC3 e2e (task 6.1): 进程足迹 = 2 — the shell keeps exactly ONE host child
// process (Electron main + host subprocess), and closing the shell leaves no
// orphan host behind (退出无孤儿进程).
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { isProcessAlive, launchFixtureApp, listHostChildren } from './helpers/fixture-app.ts'

test('SC3 process footprint: exactly one host child; no orphan after app close', async () => {
  const fixture = await launchFixtureApp()
  const { electronApp, page, pidFile } = fixture
  try {
    // Host booted: the fixture host child recorded its pid.
    const firstPid = Number((await readFile(pidFile, 'utf8')).trim().split('\n')[0])
    expect(Number.isInteger(firstPid)).toBe(true)

    // AC: exactly one host child process of the Electron main process.
    const children = await listHostChildren(electronApp, 'host-entry.mjs')
    expect(children).toHaveLength(1)
    expect(children[0].pid).toBe(firstPid)
    expect(isProcessAlive(firstPid)).toBe(true)

    // The SPA is live over the carried API (sanity: the footprint being
    // measured is a working carrier, not a half-booted shell).
    expect(await page.evaluate(() => document.getElementById('root') !== null)).toBe(true)
  } finally {
    await fixture.close()
  }

  // AC: 退出无孤儿进程 — after the shell exits the host child is gone.
  const pid = Number((await readFile(pidFile, 'utf8')).trim().split('\n')[0])
  await expect
    .poll(() => isProcessAlive(pid), { timeout: 15_000 })
    .toBe(false)
})
