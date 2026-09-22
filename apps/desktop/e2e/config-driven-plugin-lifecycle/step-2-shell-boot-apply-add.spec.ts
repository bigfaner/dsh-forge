// @feature ui-plugin-foundation | @web-e2e | @journey config-driven-plugin-lifecycle
// Traceability: docs/features/ui-plugin-foundation/testing/config-driven-plugin-lifecycle/contracts/step-2-shell-boot-apply-add.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  BASE_BUNDLES,
  HELLO_WORLD,
  HELLO_WORLD_DIR,
  MAIN_PATH,
  helloWorldTarball,
  expectMaterialized,
  expectRosterContains,
  hashTree,
  launchPluginShell,
  launchStateShell,
  packPlugin,
  readProfileBundles,
  sha256File,
} from '../helpers/plugins.ts'

const STAGED_AT = 'plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz'
const SOURCE = `tarball:${STAGED_AT}`
const HW_ENTRY = { name: HELLO_WORLD, source: SOURCE }

test('step-2/success: boot materializes + assembles the added entry, roster carries it, shell code unchanged', async ({ }, testInfo) => {
  testInfo.setTimeout(240_000)
  testInfo.annotations.push({
    type: 'note',
    description: 'Panel DOM markers render only on completed assistant turns (task 2 evidence) — session content is user data, so the web-observable assembly proof here is the host-pushed boot roster (__DSH_BOOT__ @dsh-forge/* entries); panel/screenshot evidence rides the live-ui-probe --plugin-leg channel (artifacts SHELL-S0-panel-*.png).',
  })
  const shellSrcDir = join(MAIN_PATH, '..', '..', 'src')
  const shellCodeBefore = hashTree(shellSrcDir)
  const shell = await launchPluginShell({
    bundles: [...BASE_BUNDLES, HW_ENTRY],
    stageTarballs: [{ at: STAGED_AT, from: helloWorldTarball() }],
  })
  try {
    // Output: the entry took effect — assembled into the host boot roster.
    await expectRosterContains(shell, HELLO_WORLD)

    // State: manifest converged to config order; node_modules materialized
    // with the .dsh-forge-seed.json marker carrying the artifact sha256.
    expect(readProfileBundles(shell.profileDir)).toEqual([...BASE_BUNDLES.map(b => b.name), HELLO_WORLD])
    await expectMaterialized(shell.profileDir, HELLO_WORLD, SOURCE, sha256File(helloWorldTarball()))

    // Invariant: shell code diff = 0 across the config-driven add.
    expect(hashTree(shellSrcDir)).toBe(shellCodeBefore)
  } finally { await shell.close() }
})

test('step-2/cold-start-regression: the timing channel records the probe anchors for budget comparison', async ({ }, testInfo) => {
  testInfo.setTimeout(240_000)
  testInfo.annotations.push({
    type: 'note',
    description: 'Budget gate (delta <=5% and <=100ms vs the archived M1 baseline median 4347ms, task 2 record) runs in the acceptance channel on the committed default profile — shared-runner timing is not hermetic. Here the same-anchor measurement (launch -> firstWindow -> ui-ready) is recorded and structurally valid.',
  })
  const launchStart = Date.now()
  const shell = await launchPluginShell({
    bundles: [...BASE_BUNDLES, HW_ENTRY],
    stageTarballs: [{ at: STAGED_AT, from: helloWorldTarball() }],
  })
  try {
    const firstWindowMs = Date.now() - launchStart // firstWindow resolved inside the launcher
    await shell.uiReady() // idempotent: already waited during launch
    const uiReadyMs = Date.now() - launchStart
    expect(firstWindowMs).toBeGreaterThan(0)
    expect(uiReadyMs).toBeGreaterThanOrEqual(firstWindowMs)
    await expectRosterContains(shell, HELLO_WORLD)
    testInfo.annotations.push({ type: 'note', description: `cold-start anchors: firstWindow=${String(firstWindowMs)}ms uiReady=${String(uiReadyMs)}ms` })
  } finally { await shell.close() }
})

test('step-2/seed-sha-drift-converge: staged artifact sha drift re-materializes the entry and converges the marker', async ({ }, testInfo) => {
  testInfo.setTimeout(180_000)
  testInfo.annotations.push({
    type: 'note',
    description: 'Drift fixture = same package identity packed at version 0.2.0 (FT-018: the marker carries the artifact sha256; drift converges by rebuild — write-once allows exactly this convergence, other entries untouched).',
  })
  const drifted = packPlugin(HELLO_WORLD_DIR, '0.2.0')
  expect(drifted.sha256).not.toBe(sha256File(helloWorldTarball()))

  // One persistent root; two boots against it.
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-drift-e2e-'))
  const boot1 = await launchStateShell({
    rootDir: root,
    bundles: [...BASE_BUNDLES, HW_ENTRY],
    stageTarballs: [{ at: STAGED_AT, from: helloWorldTarball() }],
  })
  try {
    await expectMaterialized(boot1.profileDir, HELLO_WORLD, SOURCE, sha256File(helloWorldTarball()))
  } finally { await boot1.close() }

  // Artifact drift: the staged bytes change under the SAME config source.
  boot1.stageTarball(STAGED_AT, drifted.tarball)

  const boot2 = await launchStateShell({ rootDir: root, bundles: [...BASE_BUNDLES, HW_ENTRY] })
  try {
    // Output: the drift is recognized and converges — materialization rebuilt
    // from the new artifact, marker rewritten to its sha256, panel-equivalent
    // assembly state restored (version visible in the materialized manifest).
    await expectMaterialized(boot2.profileDir, HELLO_WORLD, SOURCE, drifted.sha256)
    const materializedManifest = JSON.parse(
      await (await import('node:fs/promises')).readFile(join(boot2.profileDir, 'node_modules', ...HELLO_WORLD.split('/'), 'package.json'), 'utf8'),
    ) as { version?: string }
    expect(materializedManifest.version).toBe('0.2.0')

    // State: the rest of the projection is unaffected by the convergence.
    expect(readProfileBundles(boot2.profileDir)).toEqual([...BASE_BUNDLES.map(b => b.name), HELLO_WORLD])
  } finally { await boot2.close() }
})
