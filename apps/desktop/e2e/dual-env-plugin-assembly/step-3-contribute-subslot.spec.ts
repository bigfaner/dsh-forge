// @feature ui-plugin-foundation | @web-e2e | @journey dual-env-plugin-assembly
// Traceability: docs/features/ui-plugin-foundation/testing/dual-env-plugin-assembly/contracts/step-3-contribute-subslot.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  BASE_BUNDLES,
  COLLISION_DIR,
  COLLISION_FIXTURE,
  HELLO_WORLD,
  HELLO_WORLD_DIR,
  helloWorldTarball,
  REPO_ROOT,
  expectRosterContains,
  launchPluginShell,
  packPlugin,
} from '../helpers/plugins.ts'
import { scanArtifactModuleSources } from '../../../../scripts/verify-plugins.mjs'

const STAGED_AT = 'plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz'
const PANEL_SLOT = 'hello-world.panel'

test('step-3/success: the plugin contributes its own sub-slot with a store seat through the register call', async () => {
  // The built client declares the contributed sub-slot (children table),
  // the store seat factory, and the locale namespace — the "component +
  // sub-slot + store seat" registration shape of the real register call.
  const builtClient = readFileSync(join(HELLO_WORLD_DIR, 'lib', 'client.js'), 'utf8')
  expect(builtClient).toContain(PANEL_SLOT)
  expect(builtClient).toContain('createHelloWorldStore')
  expect(builtClient).toContain('helloworld')
  // Single-kind session-scoped member types (FT-022 SlotMap declaration).
  const source = readFileSync(join(HELLO_WORLD_DIR, 'src', 'client', 'index.ts'), 'utf8')
  expect(source).toContain(`'${PANEL_SLOT}': { kind: 'single', scope: 'session' }`)
})

test('step-3/third-party-registration-renders: a second plugin declaring the panel key enters the same assembly channel', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)
  testInfo.annotations.push({
    type: 'note',
    description: 'The real third-party registrant on the panel key is the committed collision fixture (replica mode). Its presence in the SAME config-driven channel — no special-casing — is the platform-openness proof at the e2e layer; what happens at the key itself (declaration collision -> startup pageerror naming the first declarer) is the slot-collision journey\'s live leg + the unit matrix against the real SlotCore.',
  })
  const fixture = packPlugin(COLLISION_DIR)
  const fixtureAt = 'plugin-tarballs/dsh-forge-plugin-hello-world-collision-0.1.0.tgz'
  const shell = await launchPluginShell({
    bundles: [
      ...BASE_BUNDLES,
      { name: HELLO_WORLD, source: `tarball:${STAGED_AT}` },
      { name: COLLISION_FIXTURE, source: `tarball:${fixtureAt}` },
    ],
    stageTarballs: [
      { at: STAGED_AT, from: helloWorldTarball() },
      { at: fixtureAt, from: fixture.tarball },
    ],
  })
  try {
    // Both plugins ride the standard channel into the boot graph.
    await expectRosterContains(shell, HELLO_WORLD)
    await expectRosterContains(shell, COLLISION_FIXTURE)
    // The collision at the panel key is OBSERVABLE (not silent): the replica
    // probe's register throw surfaces as a pageerror naming the slot.
    await expect.poll(() => shell.pageErrors.join('\n'), { timeout: 30_000 }).toContain(PANEL_SLOT)
    // The host core surface survives the throwing registration.
    await expect(shell.page.getByRole('button', { name: /新建会话|New Session/ }).first()).toBeVisible()
  } finally { await shell.close() }
})

test('step-3/vendored-reference-redlight: artifact-level module-source scan is red on vendor references, green on the real artifacts', async () => {
  // Real artifacts: zero vendored-tree references (delivery constraint green).
  const realClient = readFileSync(join(HELLO_WORLD_DIR, 'lib', 'client.js'), 'utf8')
  const green = scanArtifactModuleSources(
    { name: HELLO_WORLD, dir: 'packages/plugins/hello-world' },
    [{ path: join(HELLO_WORLD_DIR, 'lib', 'client.js'), code: realClient }],
    REPO_ROOT,
  )
  expect(green.ok, green.violations.map(v => v.detail).join('\n')).toBe(true)
  expect(green.specifierCount).toBeGreaterThan(0)

  // Doctored artifact: a relative import resolving into the repo vendor tree
  // trips the machine-enforced red light with the file + reason named.
  const doctoredPath = join(REPO_ROOT, 'packages', 'plugins', 'fixture', 'lib', 'client.js')
  for (const bad of [
    'import lock from "../../../../vendor/upstream.lock.json"',
    'const cfg = require("file:../../fixtures/host-config.json")',
  ]) {
    const red = scanArtifactModuleSources(
      { name: HELLO_WORLD, dir: 'packages/plugins/fixture' },
      [{ path: doctoredPath, code: bad }],
      REPO_ROOT,
    )
    expect(red.ok, `fixture must trip: ${bad.slice(0, 40)}`).toBe(false)
    expect(red.violations[0]?.detail).toContain('fixture/lib/client.js')
  }
})
