// @feature ui-plugin-foundation | @web-e2e | @journey slot-collision-coexistence
// Traceability: docs/features/ui-plugin-foundation/testing/slot-collision-coexistence/contracts/step-2-install-collision-fixture.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { expect, test } from '@playwright/test'
import {
  BASE_BUNDLES,
  COLLISION_DIR,
  COLLISION_FIXTURE,
  HELLO_WORLD,
  helloWorldTarball,
  expectRosterContains,
  launchPluginShell,
  packPlugin,
  readProfileBundles,
} from '../helpers/plugins.ts'

const HW_AT = 'plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz'
const COLLISION_AT = 'plugin-tarballs/dsh-forge-plugin-hello-world-collision-0.1.0.tgz'

test('step-2/success: the collision fixture installs beside hello-world through the same standard channel', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)
  testInfo.annotations.push({
    type: 'note', description: 'The official-web self-install mechanism (dsh plugin add on the user profile) is external surface (archived S1/S2 evidence); the same-mechanism/no-special-casing property is asserted on the shell assembly channel: both plugins enter identically through the product config into manifest + boot roster.',
  })
  const fixture = packPlugin(COLLISION_DIR)
  const shell = await launchPluginShell({
    bundles: [
      ...BASE_BUNDLES,
      { name: HELLO_WORLD, source: `tarball:${HW_AT}` },
      { name: COLLISION_FIXTURE, source: `tarball:${COLLISION_AT}` },
    ],
    stageTarballs: [
      { at: HW_AT, from: helloWorldTarball() },
      { at: COLLISION_AT, from: fixture.tarball },
    ],
  })
  try {
    // Both plugins recorded side by side, one mechanism, no rejection.
    await expectRosterContains(shell, HELLO_WORLD)
    await expectRosterContains(shell, COLLISION_FIXTURE)
    expect(readProfileBundles(shell.profileDir)).toEqual([
      ...BASE_BUNDLES.map(b => b.name), HELLO_WORLD, COLLISION_FIXTURE,
    ])
  } finally { await shell.close() }
})

test('step-2/fixture-alone-baseline: the fixture alone holds the key cleanly — no collision, no error', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)
  testInfo.annotations.push({
    type: 'note', description: 'Control leg (archived S1): single declarant renders clean — proving any Step-3 collision behavior comes from the collision itself, not a fixture defect.',
  })
  const fixture = packPlugin(COLLISION_DIR)
  const shell = await launchPluginShell({
    bundles: [...BASE_BUNDLES, { name: COLLISION_FIXTURE, source: `tarball:${COLLISION_AT}` }],
    stageTarballs: [{ at: COLLISION_AT, from: fixture.tarball }],
  })
  try {
    await expectRosterContains(shell, COLLISION_FIXTURE)
    // Single declarant: the replica key registration throws nothing.
    await shell.page.waitForTimeout(5_000) // hydration window for late client loads
    expect(shell.pageErrors.join('\n')).not.toContain('hello-world.panel')
    await expect(shell.page.getByRole('button', { name: /新建会话|New Session/ }).first()).toBeVisible()
  } finally { await shell.close() }
})
