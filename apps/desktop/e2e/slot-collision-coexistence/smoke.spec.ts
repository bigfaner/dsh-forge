// @feature ui-plugin-foundation | @web-e2e | @journey slot-collision-coexistence
// Journey smoke test (happy path): hello-world baseline -> install collision
// fixture through the same channel -> observe the loud, attributable
// collision (type ③) -> archive framework in place -> uninstall restores.
// Traceability: docs/features/ui-plugin-foundation/testing/slot-collision-coexistence/contracts/step-{1..5}-*.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  BASE_BUNDLES,
  COLLISION_DIR,
  COLLISION_FIXTURE,
  HELLO_WORLD,
  PRODUCT_STAGED_TARBALL,
  REPO_ROOT,
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

test('slot-collision-coexistence journey smoke: baseline -> collide -> observe -> archive -> restore', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  const fixture = packPlugin(COLLISION_DIR)
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-collision-smoke-'))
  const staging = [
    { at: HW_AT, from: PRODUCT_STAGED_TARBALL },
    { at: COLLISION_AT, from: fixture.tarball },
  ]

  // Step 1 — baseline: hello-world alone, single declarant, clean.
  const baseline = await launchPluginShell({ rootDir: root, bundles: [...BASE_BUNDLES, HW_ENTRY], stageTarballs: staging })
  try {
    await expectRosterContains(baseline, HELLO_WORLD)
    await expect(baseline.page.getByRole('button', { name: /新建会话|New Session/ }).first()).toBeVisible()
  } finally { await baseline.close() }

  // Step 2 + 3 — both plugins through the same channel; collision observed.
  const collided = await launchPluginShell({
    rootDir: root,
    bundles: [...BASE_BUNDLES, HW_ENTRY, COLLISION_ENTRY],
    stageTarballs: staging,
  })
  try {
    await expectRosterContains(collided, HELLO_WORLD)
    await expectRosterContains(collided, COLLISION_FIXTURE)
    await expect.poll(() => collided.pageErrors.join('\n'), { timeout: 30_000 }).toContain('hello-world.panel')
    await expect(collided.page.getByRole('button', { name: /新建会话|New Session/ }).first()).toBeVisible()
  } finally { await collided.close() }

  // Step 4 — the archive framework holds the three types + the fixture ref.
  const spike = readFileSync(join(REPO_ROOT, 'docs', 'features', 'ui-plugin-foundation', 'spike-report.md'), 'utf8')
  expect(spike).toContain('合并共存')
  expect(spike).toContain('分层覆盖')
  expect(spike).toContain('启动期显式报错')

  // Step 5 — uninstall the fixture: back to the single-declarant baseline.
  const restored = await launchPluginShell({ rootDir: root, bundles: [...BASE_BUNDLES, HW_ENTRY] })
  try {
    await expectRosterLacks(restored, COLLISION_FIXTURE)
    await expectRosterContains(restored, HELLO_WORLD)
    expect(readProfileBundles(restored.profileDir)).toEqual([...BASE_BUNDLES.map(b => b.name), HELLO_WORLD])
    expect(existsSync(join(restored.profileDir, 'node_modules', ...COLLISION_FIXTURE.split('/')))).toBe(false)
  } finally { await restored.close() }
})
