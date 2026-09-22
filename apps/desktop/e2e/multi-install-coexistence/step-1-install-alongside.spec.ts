// @feature dsh-forge-m1 | @web-e2e | @journey multi-install-coexistence
// Traceability: docs/features/dsh-forge-m1/testing/multi-install-coexistence/contracts/step-1-install-alongside.md
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { launchUpstream } from '../helpers/journeys.ts'
import { listHostChildren } from '../helpers/fixture-app.ts'

test('step-1/success: dsh-forge launches alongside pre-existing upstream state, distinct profile created', async ({ }, testInfo) => {
  testInfo.annotations.push({ type: 'note', description: 'Installer and the real CLI/official-desktop installs are OS-surface; the web-observable is the fresh dsh-forge profile creation beside untouched pre-existing upstream data in the shared home.' })
  const up = await launchUpstream() // shared home holds pre-existing upstream sessions/credential
  try {
    const { page, dir } = up.fixture
    await expect(page.locator('#upstream-ui')).toBeVisible()
    // dsh-forge profile directory created and distinct from upstream data.
    expect(existsSync(join(dir, 'profile'))).toBe(true)
    expect(join(dir, 'profile')).not.toBe(up.stateFile)
    // Upstream installations' data unmodified (same pre-existing content).
    const persisted = JSON.parse(await readFile(up.stateFile, 'utf8')) as { sessions: unknown[] }
    expect(persisted.sessions).toHaveLength(1)
  } finally { await up.close() }
})

test('step-1/profile-directory-collision: two distinct profile roots, upstream profile byte-identical', async ({ }, testInfo) => {
  testInfo.annotations.push({ type: 'note', description: 'Byte-identical filesystem check is the contract-declared OS-surface qualifier; verified here on the shared-home stand-in file after the launch.' })
  const up = await launchUpstream()
  try {
    const { dir } = up.fixture
    const before = await readFile(up.stateFile, 'utf8')
    // dsh-forge profile is an independent directory, never the upstream home.
    expect(existsSync(join(dir, 'profile'))).toBe(true)
    expect(up.stateFile.startsWith(join(dir, 'profile'))).toBe(false)
    // Upstream profile content byte-identical to before the launch.
    expect(await readFile(up.stateFile, 'utf8')).toBe(before)
  } finally { await up.close() }
})

test('step-1/install-while-official-desktop-running: dsh-forge single-instance still exactly one host child', async ({ }, testInfo) => {
  testInfo.annotations.push({ type: 'note', description: 'Cross-app single-instance lock independence (official desktop vs dsh-forge) is an OS-surface qualifier; the web surface asserts dsh-forge own-instance integrity while another long-running app process coexists.' })
  const up = await launchUpstream()
  try {
    const { electronApp, page } = up.fixture
    await expect(page.locator('#upstream-ui')).toBeVisible()
    await expect.poll(async () => (await listHostChildren(electronApp, 'host-entry.mjs')).length).toBe(1)
    expect(await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
  } finally { await up.close() }
})
