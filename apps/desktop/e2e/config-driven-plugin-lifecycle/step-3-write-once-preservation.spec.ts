// @feature ui-plugin-foundation | @web-e2e | @journey config-driven-plugin-lifecycle
// Traceability: docs/features/ui-plugin-foundation/testing/config-driven-plugin-lifecycle/contracts/step-3-write-once-preservation.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  BASE_BUNDLES,
  COLLISION_DIR,
  COLLISION_FIXTURE,
  HELLO_WORLD,
  HELLO_WORLD_DIR,
  PRODUCT_STAGED_TARBALL,
  expectMaterialized,
  launchStateShell,
  packPlugin,
  readProfileBundles,
  readSeedMarker,
  sha256File,
} from '../helpers/plugins.ts'

test('step-3/success: entries untouched by the config change keep their write-once materialization', async ({ }, testInfo) => {
  testInfo.setTimeout(180_000)
  testInfo.annotations.push({
    type: 'note',
    description: 'Unaffected-entry fixture = the collision fixture plugin (a second real workspace plugin, tarball-seeded): adding hello-world must not disturb its existing materialization (存在即跳过 semantics, marker + bytes identical).',
  })
  const other = packPlugin(COLLISION_DIR)
  const otherAt = 'plugin-tarballs/dsh-forge-plugin-hello-world-collision-0.1.0.tgz'
  const otherSource = `tarball:${otherAt}`

  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-write-once-'))
  const boot1 = await launchStateShell({
    rootDir: root,
    bundles: [...BASE_BUNDLES, { name: COLLISION_FIXTURE, source: otherSource }],
    stageTarballs: [{ at: otherAt, from: other.tarball }],
  })
  try {
    await expectMaterialized(boot1.profileDir, COLLISION_FIXTURE, otherSource, other.sha256)
  } finally { await boot1.close() }

  // Config change touching a DIFFERENT entry: add hello-world.
  const stagedAt = 'plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz'
  const boot2 = await launchStateShell({
    rootDir: root,
    bundles: [...BASE_BUNDLES, { name: COLLISION_FIXTURE, source: otherSource }, { name: HELLO_WORLD, source: `tarball:${stagedAt}` }],
    stageTarballs: [{ at: stagedAt, from: PRODUCT_STAGED_TARBALL }],
  })
  try {
    // Output: the untouched entry was NOT rebuilt — its seed marker still
    // carries the ORIGINAL artifact sha and seededAt (write-once); the newly
    // added entry materialized beside it.
    const markerAfter = readSeedMarker(boot2.profileDir, COLLISION_FIXTURE)
    expect(markerAfter).toMatchObject({ bundle: COLLISION_FIXTURE, source: otherSource, sha256: other.sha256 })
    await expectMaterialized(boot2.profileDir, COLLISION_FIXTURE, otherSource, other.sha256)
    await expectMaterialized(boot2.profileDir, HELLO_WORLD, `tarball:${stagedAt}`, sha256File(PRODUCT_STAGED_TARBALL))

    // State: manifest keeps config order; no corruption of the old entry.
    expect(readProfileBundles(boot2.profileDir)).toEqual([
      ...BASE_BUNDLES.map(b => b.name), COLLISION_FIXTURE, HELLO_WORLD,
    ])
  } finally { await boot2.close() }
})

test('step-3/stale-version-materialization: config pointing at a newer version converges per the archived semantics', async ({ }, testInfo) => {
  testInfo.setTimeout(180_000)
  testInfo.annotations.push({
    type: 'note',
    description: 'Archived adjudication (task 6 / FT-018): sha/marker drift converges to the config-referenced artifact — deterministic, never a silent half-old/half-new assembly. The M2 UF6 single-config precondition holds: the manifest stays config-ordered.',
  })
  const v2 = packPlugin(HELLO_WORLD_DIR, '0.2.0')
  const v1At = 'plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz'
  const v2At = 'plugin-tarballs/dsh-forge-plugin-hello-world-0.2.0.tgz'

  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-stale-'))
  const boot1 = await launchStateShell({
    rootDir: root,
    bundles: [...BASE_BUNDLES, { name: HELLO_WORLD, source: `tarball:${v1At}` }],
    stageTarballs: [{ at: v1At, from: PRODUCT_STAGED_TARBALL }],
  })
  try {
    await expectMaterialized(boot1.profileDir, HELLO_WORLD, `tarball:${v1At}`, sha256File(PRODUCT_STAGED_TARBALL))
  } finally { await boot1.close() }

  // Config entry now references the NEWER artifact (different basename).
  const boot2 = await launchStateShell({
    rootDir: root,
    bundles: [...BASE_BUNDLES, { name: HELLO_WORLD, source: `tarball:${v2At}` }],
    stageTarballs: [{ at: v2At, from: v2.tarball }],
  })
  try {
    // Output: deterministic convergence to the new version — attributable to
    // the archived marker/sha semantics, no half-old/half-new state.
    await expectMaterialized(boot2.profileDir, HELLO_WORLD, `tarball:${v2At}`, v2.sha256)
    const materialized = JSON.parse(readFileSync(join(boot2.profileDir, 'node_modules', ...HELLO_WORLD.split('/'), 'package.json'), 'utf8')) as { version?: string }
    expect(materialized.version).toBe('0.2.0')
    expect(readProfileBundles(boot2.profileDir)).toEqual([...BASE_BUNDLES.map(b => b.name), HELLO_WORLD])
  } finally { await boot2.close() }
})

test('step-3/fallback-links-preserved: upstream-owned .dsh-module-fallback links survive reconciliation', async ({ }, testInfo) => {
  testInfo.setTimeout(180_000)
  testInfo.annotations.push({
    type: 'note',
    description: 'FT-017/FT-019: .dsh-module-fallback/ is upstream-owned boot-self-healing territory; the projector never touches it. Fixture = a junction into that dir planted next to the plugin materialization; a remove-leg reconciliation must leave both untouched.',
  })
  const stagedAt = 'plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz'
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-fallback-'))
  const boot1 = await launchStateShell({
    rootDir: root,
    bundles: [...BASE_BUNDLES, { name: HELLO_WORLD, source: `tarball:${stagedAt}` }],
    stageTarballs: [{ at: stagedAt, from: PRODUCT_STAGED_TARBALL }],
  })
  try {
    await expectMaterialized(boot1.profileDir, HELLO_WORLD, `tarball:${stagedAt}`, sha256File(PRODUCT_STAGED_TARBALL))
  } finally { await boot1.close() }

  // Plant the upstream-owned fallback fixture (the shape the host heals).
  const fallbackDir = join(boot1.profileDir, 'node_modules', '.dsh-module-fallback')
  const fallbackTarget = join(fallbackDir, 'vendored-pkg')
  mkdirSync(fallbackTarget, { recursive: true })
  const fallbackLink = join(boot1.profileDir, 'node_modules', '@vendored-fallback-link')
  symlinkSync(fallbackTarget, fallbackLink, 'junction')
  expect(existsSync(fallbackLink)).toBe(true)

  // Config removes hello-world — the delete leg runs beside the fallback area.
  const boot2 = await launchStateShell({ rootDir: root, bundles: BASE_BUNDLES })
  try {
    // Output: the plugin materialization is pruned; the upstream-owned
    // fallback link and its dir are untouched (host self-healing territory).
    expect(existsSync(join(boot2.profileDir, 'node_modules', ...HELLO_WORLD.split('/')))).toBe(false)
    expect(existsSync(fallbackLink), 'upstream fallback link').toBe(true)
    expect(lstatSync(fallbackLink).isSymbolicLink()).toBe(true)
    expect(existsSync(fallbackTarget), 'fallback target dir').toBe(true)
    expect(readProfileBundles(boot2.profileDir)).toEqual(BASE_BUNDLES.map(b => b.name))
  } finally { await boot2.close() }
})
