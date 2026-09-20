// @feature dsh-forge-m1 | @web-e2e | @journey multi-install-coexistence
// Traceability: docs/features/dsh-forge-m1/testing/multi-install-coexistence/contracts/step-2-read-shared-data.md
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { _electron, expect, test } from '@playwright/test'
import { launchUpstream } from '../helpers/journeys.ts'
import { listHostChildren } from '../helpers/fixture-app.ts'

const appDir = join(fileURLToPath(new URL('..', import.meta.url)), '..', '..')

test('step-2/success: CLI/official-desktop sessions and credentials read in the upstream format, no write on read', async () => {
  const up = await launchUpstream({
    sessions: [
      { id: 's1', title: 'cli-created session', created_by: 'cli', workspace: 'ws-alpha', state: 'idle', history: [{ role: 'user', content: 'from cli', kind: 'message' }] },
      { id: 's2', title: 'official desktop session', created_by: 'official-desktop', workspace: 'ws-alpha', state: 'idle', history: [] },
    ],
  })
  try {
    const { page } = up.fixture
    const before = await readFile(up.stateFile, 'utf8')
    await expect(page.locator('#session-list li')).toHaveCount(2)
    await page.locator('#session-list li').first().click()
    await expect(page.locator('#session-title')).toHaveText('cli-created session')
    await expect(page.locator('#session-history .entry').first()).toContainText('from cli')
    // Read is write-free: browsed shared data byte-identical afterwards.
    expect(await readFile(up.stateFile, 'utf8')).toBe(before)
  } finally { await up.close() }
})

test('step-2/second-instance-while-both-apps-run: dsh-forge lock blocks a second dsh-forge (FT-006)', async ({ }, testInfo) => {
  testInfo.annotations.push({ type: 'note', description: 'The official-desktop instance is an OS-surface stand-in; the web surface asserts the dsh-forge single-instance invariant while another app process runs.' })
  const up = await launchUpstream()
  let second: import('@playwright/test').ElectronApplication | undefined
  try {
    const { electronApp, dir } = up.fixture
    let blocked = false
    try {
      second = await _electron.launch({ args: [join(appDir, 'dist', 'main.cjs')], env: { ...process.env, DSH_FORGE_PROFILE_DIR: join(dir, 'profile') }, timeout: 15_000 })
      blocked = await Promise.race([
        new Promise<boolean>(resolve => { second?.process().once('exit', () => resolve(true)) }),
        new Promise<boolean>(resolve => setTimeout(() => resolve(false), 10_000)),
      ])
    } catch { blocked = true }
    expect(blocked).toBe(true)
    // Exactly one dsh-forge instance and one host subprocess remain.
    expect(await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
    await expect.poll(async () => (await listHostChildren(electronApp, 'host-entry.mjs')).length).toBe(1)
  } finally {
    await second?.close().catch(() => {})
    await up.close()
  }
})

test('step-2/credential-read-shared: CLI-written credential displays masked, file unchanged', async () => {
  const up = await launchUpstream({ credential: { value: 'sk-cli-written-key-abcdef', masked: 'sk-cl********cdef' } })
  try {
    const { page } = up.fixture
    const before = await readFile(up.stateFile, 'utf8')
    await page.locator('#nav-settings').click()
    await page.locator('#load-credential-btn').click()
    await expect(page.locator('#masked-key')).toHaveText('sk-cl********cdef')
    expect(await page.locator('#surface-settings').textContent()).not.toContain('sk-cli-written-key-abcdef')
    expect(await readFile(up.stateFile, 'utf8')).toBe(before) // unchanged on read
  } finally { await up.close() }
})
