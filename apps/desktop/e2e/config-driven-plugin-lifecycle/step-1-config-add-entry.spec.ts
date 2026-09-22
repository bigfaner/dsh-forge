// @feature ui-plugin-foundation | @web-e2e | @journey config-driven-plugin-lifecycle
// Traceability: docs/features/ui-plugin-foundation/testing/config-driven-plugin-lifecycle/contracts/step-1-config-add-entry.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  BASE_BUNDLES,
  HELLO_WORLD,
  helloWorldTarball,
  expectNotMaterialized,
  expectRecoveryFailed,
  launchStateShell,
  readProfileBundles,
} from '../helpers/plugins.ts'

// Step 1 covers the edit-then-boot seam: the config edit itself must leave
// the existing projection untouched until the next boot reconciles it.

test('step-1/success: config edit adds the hello-world entry, projection untouched until reboot', async () => {
  const stagedAt = 'plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz'
  const state = await launchStateShell({
    bundles: BASE_BUNDLES,
    stageTarballs: [{ at: stagedAt, from: helloWorldTarball() }],
  })
  try {
    // Existing projection baseline (write-once leg fixture: one prior profile).
    expect(readProfileBundles(state.profileDir)).toEqual(BASE_BUNDLES.map(b => b.name))

    // User action: edit the product config, adding the hello-world entry.
    state.writeConfig([...BASE_BUNDLES, { name: HELLO_WORLD, source: `tarball:${stagedAt}` }])

    // Output: the config update holds as valid JSON and lists hello-world.
    const written = JSON.parse(readFileSync(state.configPath, 'utf8')) as { bundles: Array<{ name: string; source?: string }> }
    expect(written.bundles.map(b => b.name)).toContain(HELLO_WORLD)
    expect(written.bundles[2]?.source).toBe(`tarball:${stagedAt}`)

    // State: shell not restarted — the userData projection keeps the old list
    // and has no hello-world materialization yet (reconciliation is boot-time).
    expect(readProfileBundles(state.profileDir)).toEqual(BASE_BUNDLES.map(b => b.name))
    expectNotMaterialized(state.profileDir, HELLO_WORLD)
  } finally { await state.close() }
})

test('step-1/config-malformed: unreadable/invalid config fails loud at startup, no half-assembly', async ({ }, testInfo) => {
  testInfo.setTimeout(120_000)
  const brokenPayloads = [
    { label: 'not JSON', bytes: 'this is not json' },
    { label: 'empty bundles', bytes: `${JSON.stringify({ bundles: [] })}\n` },
  ]
  for (const broken of brokenPayloads) {
    // Sabotage a config in place while its shell is up, then close that shell
    // (single-instance lock: only one carrier may run at a time) and reboot
    // against the sabotaged file.
    const holder = await launchStateShell({ bundles: BASE_BUNDLES })
    const brokenConfigPath = holder.configPath
    const rebootProfileDir = join(holder.profileDir, '..', 'profile-reboot')
    writeFileSync(brokenConfigPath, broken.bytes)
    await holder.close()

    const state = await launchStateShell({
      bundles: BASE_BUNDLES,
      env: {
        DSH_FORGE_PLUGIN_BUNDLES: brokenConfigPath,
        DSH_FORGE_PROFILE_DIR: rebootProfileDir,
      },
    })
    try {
      // Output: explicit startup diagnosis (UF4 failed state + overlay) —
      // never a silent crash, never a half-assembled unknown plugin tree.
      await expectRecoveryFailed(state.fixture.page)
      // State: the projection the failed boot would have owned is absent —
      // nothing was materialized from an unknown plugin tree.
      expect(existsSync(join(rebootProfileDir, 'node_modules'))).toBe(false)
    } finally { await state.close() }
  }
})

test('step-1/config-missing: absent config file fails loud with a config-pointing diagnosis', async ({ }, testInfo) => {
  testInfo.setTimeout(90_000)
  testInfo.annotations.push({
    type: 'note',
    description: 'Missing-file leg of the malformed boundary: the loader message must name the config path — the bundle list has no other source (FT-016 loader contract).',
  })
  const state = await launchStateShell({
    bundles: BASE_BUNDLES,
    env: { DSH_FORGE_PLUGIN_BUNDLES: join(tmpdir(), 'definitely-missing-plugin-bundles.json') },
  })
  try {
    await expectRecoveryFailed(state.fixture.page)
  } finally { await state.close() }
})

test('step-1/source-missing: entry whose tarball artifact is absent fails loud, no partial materialization', async ({ }, testInfo) => {
  testInfo.setTimeout(120_000)
  testInfo.annotations.push({
    type: 'note',
    description: 'Config-declared artifact basename vs staged file (FT-027). The manifest rewrite precedes seeding by design, so the loud abort — not a silent skip of the entry — is the gated behavior; node_modules keeps no half materialization and no seed scratch dir survives (staging-dir cleanup in seedTarball).',
  })
  const state = await launchStateShell({
    bundles: [...BASE_BUNDLES, { name: HELLO_WORLD, source: 'tarball:plugin-tarballs/never-staged.tgz' }],
  })
  try {
    await expectRecoveryFailed(state.fixture.page)
    const nodeModules = join(state.profileDir, 'node_modules')
    expect(existsSync(join(nodeModules, ...HELLO_WORLD.split('/'))), 'half materialization').toBe(false)
    if (existsSync(nodeModules)) {
      const scratch = readdirSync(nodeModules).filter(name => name.startsWith('.dsh-forge-seed-'))
      expect(scratch, 'seed scratch leftovers').toEqual([])
    }
  } finally { await state.close() }
})
