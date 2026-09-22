// @feature ui-plugin-foundation | @web-e2e | @journey config-driven-plugin-lifecycle
// Journey smoke test (happy path): config add -> boot applies -> write-once
// preserved -> config remove -> reboot cleans -> re-add closes the loop.
// Traceability: docs/features/ui-plugin-foundation/testing/config-driven-plugin-lifecycle/contracts/step-{1..5}-*.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  BASE_BUNDLES,
  HELLO_WORLD,
  helloWorldTarball,
  REPO_ROOT,
  expectMaterialized,
  expectRosterContains,
  expectRosterLacks,
  hashTree,
  launchPluginShell,
  readProfileBundles,
  readSeedMarker,
  sha256File,
} from '../helpers/plugins.ts'

const STAGED_AT = 'plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz'
const SOURCE = `tarball:${STAGED_AT}`
const HW_ENTRY = { name: HELLO_WORLD, source: SOURCE }

test('config-driven-plugin-lifecycle journey smoke: add -> apply -> write-once -> remove -> re-add', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-lifecycle-smoke-'))
  const mainSrc = join(REPO_ROOT, 'apps', 'desktop', 'src')
  const codeIdentity = hashTree(mainSrc)

  // Step 1 — add the entry to the product config (projection untouched).
  const boot1 = await launchPluginShell({ rootDir: root, bundles: BASE_BUNDLES })
  try {
    expect(readProfileBundles(boot1.profileDir)).toEqual(BASE_BUNDLES.map(b => b.name))
    boot1.writeConfig([...BASE_BUNDLES, HW_ENTRY])
    boot1.stageTarball(STAGED_AT, helloWorldTarball())
    expect(readProfileBundles(boot1.profileDir)).toEqual(BASE_BUNDLES.map(b => b.name))
  } finally { await boot1.close() }

  // Step 2 — boot: the entry takes effect (roster + materialization + marker).
  const boot2 = await launchPluginShell({ rootDir: root, bundles: [...BASE_BUNDLES, HW_ENTRY] })
  try {
    await expectRosterContains(boot2, HELLO_WORLD)
    await expectMaterialized(boot2.profileDir, HELLO_WORLD, SOURCE, sha256File(helloWorldTarball()))
    // Step 3 — write-once: the base entries' manifest face is untouched.
    expect(readProfileBundles(boot2.profileDir)).toEqual([...BASE_BUNDLES.map(b => b.name), HELLO_WORLD])
  } finally { await boot2.close() }

  // Step 4 — remove the entry, reboot: cleanup + disassembly.
  const boot3 = await launchPluginShell({ rootDir: root, bundles: BASE_BUNDLES })
  try {
    await expectRosterLacks(boot3, HELLO_WORLD)
    expect(readProfileBundles(boot3.profileDir)).toEqual(BASE_BUNDLES.map(b => b.name))
    expect(existsSync(join(boot3.profileDir, 'node_modules', ...HELLO_WORLD.split('/')))).toBe(false)
  } finally { await boot3.close() }

  // Step 5 — re-add, reboot: the loop closes with the identical first state.
  const boot4 = await launchPluginShell({ rootDir: root, bundles: [...BASE_BUNDLES, HW_ENTRY] })
  try {
    await expectRosterContains(boot4, HELLO_WORLD)
    const marker = readSeedMarker(boot4.profileDir, HELLO_WORLD)
    expect(marker).toMatchObject({ bundle: HELLO_WORLD, source: SOURCE, sha256: sha256File(helloWorldTarball()) })
  } finally { await boot4.close() }

  // Journey invariant: shell code identity across the whole add/remove cycle.
  expect(hashTree(mainSrc)).toBe(codeIdentity)
})
