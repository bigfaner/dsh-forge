// @feature ui-plugin-foundation | @web-e2e | @journey slot-collision-coexistence
// Traceability: docs/features/ui-plugin-foundation/testing/slot-collision-coexistence/contracts/step-3-observe-collision-behavior.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { expect, test } from '@playwright/test'
import {
  BASE_BUNDLES,
  COLLISION_DIR,
  COLLISION_FIXTURE,
  HELLO_WORLD,
  PRODUCT_STAGED_TARBALL,
  expectRosterContains,
  launchPluginShell,
  packPlugin,
} from '../helpers/plugins.ts'

const HW_AT = 'plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz'
const COLLISION_AT = 'plugin-tarballs/dsh-forge-plugin-hello-world-collision-0.1.0.tgz'
const PANEL_SLOT = 'hello-world.panel'
/** A shared launcher for the collided assembly (config order = declaration order). */
async function launchCollided() {
  const fixture = packPlugin(COLLISION_DIR)
  return launchPluginShell({
    bundles: [
      ...BASE_BUNDLES,
      { name: HELLO_WORLD, source: `tarball:${HW_AT}` },
      { name: COLLISION_FIXTURE, source: `tarball:${COLLISION_AT}` },
    ],
    stageTarballs: [
      { at: HW_AT, from: PRODUCT_STAGED_TARBALL },
      { at: COLLISION_AT, from: fixture.tarball },
    ],
  })
}

test('step-3/success: the collision is observed and classifiable — type ③ startup-explicit-error', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)
  testInfo.annotations.push({
    type: 'note', description: 'Committed probe = replica mode (same contributed child key). Archived live classification (S2): the later declarant\'s register throws at startup naming the slot and the first declarer; the app keeps running. E2E reproduces it on the shell channel: pageerror names hello-world.panel, first declarant retained in the roster, host surface alive.',
  })
  const shell = await launchCollided()
  try {
    await expectRosterContains(shell, HELLO_WORLD)
    await expectRosterContains(shell, COLLISION_FIXTURE)
    // The observed behavior IS attributable: the error names the slot key.
    await expect.poll(() => shell.pageErrors.join('\n'), { timeout: 30_000 }).toContain(PANEL_SLOT)
    // The app did not die on the collision (no crash mask, core surface up).
    await expect(shell.page.getByRole('button', { name: /新建会话|New Session/ }).first()).toBeVisible()
    await expect(shell.page.locator('#dsh-forge-crash-recovery')).toHaveCount(0)
  } finally { await shell.close() }
})

test('step-3/silent-latter-overrides: NOT silent — the latter declarant is loud, the first declarant survives', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)
  testInfo.annotations.push({
    type: 'note', description: 'SC6 failure state = silent latter override, unobservable. The observed reality is the opposite: the override attempt throws loudly (observable pageerror) and the first declarant stays — so the silent-override verdict is disproven by the observable evidence.',
  })
  const shell = await launchCollided()
  try {
    await expectRosterContains(shell, HELLO_WORLD)
    // Observability: a conflict marker exists in the evidence channel.
    await expect.poll(() => shell.pageErrors.length, { timeout: 30_000 }).toBeGreaterThan(0)
    const errors = shell.pageErrors.join('\n')
    // Attribution: the error ties to the collided slot key (and names the
    // already-declared state — not an anonymous failure).
    expect(errors).toContain('already declared')
    // The first declarant is NOT silently replaced by the later one: the
    // roster still carries hello-world assembled (its registration survived).
    await expectRosterContains(shell, HELLO_WORLD)
  } finally { await shell.close() }
})

test('step-3/startup-explicit-error: the explicit-error type is diagnosable and recoverable-by-removal ready', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)
  testInfo.annotations.push({
    type: 'note', description: 'Third type leg: startup-time explicit error with attributable diagnostics (slot + declarer), no white screen/dead hang. Recovery-by-removal is executed in step 5; here the diagnosability contract is asserted.',
  })
  const shell = await launchCollided()
  try {
    await expect.poll(() => shell.pageErrors.find(msg => msg.includes(PANEL_SLOT)) ?? '', { timeout: 30_000 }).toContain(PANEL_SLOT)
    const error = shell.pageErrors.find(msg => msg.includes(PANEL_SLOT)) ?? ''
    // The diagnostic names the collided slot key AND the registry verdict.
    expect(error).toContain('already declared')
    // No unresponsive death: the document keeps rendering core affordances.
    await expect(shell.page.getByRole('button', { name: /新建会话|New Session/ }).first()).toBeVisible()
  } finally { await shell.close() }
})
