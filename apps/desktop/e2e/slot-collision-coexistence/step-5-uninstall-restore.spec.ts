// @feature ui-plugin-foundation | @web-e2e | @journey slot-collision-coexistence
// Traceability: docs/features/ui-plugin-foundation/testing/slot-collision-coexistence/contracts/step-5-uninstall-restore.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  BASE_BUNDLES,
  COLLISION_DIR,
  COLLISION_FIXTURE,
  HELLO_WORLD,
  helloWorldTarball,
  expectRosterContains,
  expectRosterLacks,
  launchPluginShell,
  packPlugin,
  readProfileBundles,
} from '../helpers/plugins.ts'

const HW_AT = 'plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz'
const COLLISION_AT = 'plugin-tarballs/dsh-forge-plugin-hello-world-collision-0.1.0.tgz'
const HW_ENTRY = { name: HELLO_WORLD, source: `tarball:${HW_AT}` }
const COLLISION_ENTRY = { name: COLLISION_FIXTURE, source: `tarball:${COLLISION_AT}` }

test('step-5/remove-collision-only: removing the fixture restores the single-declarant baseline', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)
  testInfo.annotations.push({
    type: 'note', description: 'Removal = config-source removal + reboot on the shell channel (the self-install removal face is archived evidence). Restored baseline: roster keeps only hello-world, the collision error is gone, its materialization cleared.',
  })
  const fixture = packPlugin(COLLISION_DIR)
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-uninstall-'))
  const both = await launchPluginShell({
    rootDir: root,
    bundles: [...BASE_BUNDLES, HW_ENTRY, COLLISION_ENTRY],
    stageTarballs: [
      { at: HW_AT, from: helloWorldTarball() },
      { at: COLLISION_AT, from: fixture.tarball },
    ],
  })
  try {
    await expectRosterContains(both, HELLO_WORLD)
    await expectRosterContains(both, COLLISION_FIXTURE)
    await expect.poll(() => both.pageErrors.join('\n'), { timeout: 30_000 }).toContain('hello-world.panel')
  } finally { await both.close() }

  // Remove the collision fixture (keep hello-world), reload.
  const restored = await launchPluginShell({ rootDir: root, bundles: [...BASE_BUNDLES, HW_ENTRY] })
  try {
    await expectRosterLacks(restored, COLLISION_FIXTURE)
    await expectRosterContains(restored, HELLO_WORLD)
    // No residual registration state: the collision error does not recur.
    await restored.uiReady()
    await restored.page.waitForTimeout(5_000) // hydration window for late client loads
    expect(restored.pageErrors.join('\n')).not.toContain('hello-world.panel')
    // Materialization of the removed plugin is cleared from the profile.
    expect(existsSync(join(restored.profileDir, 'node_modules', ...COLLISION_FIXTURE.split('/')))).toBe(false)
    expect(readProfileBundles(restored.profileDir)).toEqual([...BASE_BUNDLES.map(b => b.name), HELLO_WORLD])
  } finally { await restored.close() }
})

test('step-5/remove-all-pristine: removing both plugins returns the UI to the plugin-free baseline', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)
  const fixture = packPlugin(COLLISION_DIR)
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-uninstall-all-'))
  const both = await launchPluginShell({
    rootDir: root,
    bundles: [...BASE_BUNDLES, HW_ENTRY, COLLISION_ENTRY],
    stageTarballs: [
      { at: HW_AT, from: helloWorldTarball() },
      { at: COLLISION_AT, from: fixture.tarball },
    ],
  })
  try {
    await expectRosterContains(both, COLLISION_FIXTURE)
  } finally { await both.close() }

  const pristine = await launchPluginShell({ rootDir: root, bundles: BASE_BUNDLES })
  try {
    // No @dsh-forge trace anywhere: roster clean, manifest clean, tree clean.
    await pristine.uiReady()
    expect(await pristine.rosterProductPlugins()).toEqual([])
    expect(readProfileBundles(pristine.profileDir)).toEqual(BASE_BUNDLES.map(b => b.name))
    expect(existsSync(join(pristine.profileDir, 'node_modules', '@dsh-forge'))).toBe(false)
    await expect(pristine.page.getByRole('button', { name: /新建会话|New Session/ }).first()).toBeVisible()
  } finally { await pristine.close() }
})
