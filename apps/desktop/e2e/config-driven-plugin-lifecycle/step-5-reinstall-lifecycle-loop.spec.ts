// @feature ui-plugin-foundation | @web-e2e | @journey config-driven-plugin-lifecycle
// Traceability: docs/features/ui-plugin-foundation/testing/config-driven-plugin-lifecycle/contracts/step-5-reinstall-lifecycle-loop.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  BASE_BUNDLES,
  HELLO_WORLD,
  helloWorldTarball,
  expectMaterialized,
  launchStateShell,
  readProfileBundles,
  readSeedMarker,
  sha256File,
} from '../helpers/plugins.ts'

const STAGED_AT = 'plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz'
const SOURCE = `tarball:${STAGED_AT}`

test('step-5/success: re-adding the entry rebuilds the materialization — the lifecycle closes', async ({ }, testInfo) => {
  testInfo.setTimeout(240_000)
  testInfo.annotations.push({
    type: 'note',
    description: 'Lifecycle closure 加 -> 生效 -> 删 -> 清理 -> 再加 -> 再生效 asserted on one persistent profile: the final state equals the first-boot state (marker sha, manifest order) — cleanup left no permanent residue.',
  })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-reinstall-'))

  const boot1 = await launchStateShell({
    rootDir: root,
    bundles: [...BASE_BUNDLES, { name: HELLO_WORLD, source: SOURCE }],
    stageTarballs: [{ at: STAGED_AT, from: helloWorldTarball() }],
  })
  try {
    await expectMaterialized(boot1.profileDir, HELLO_WORLD, SOURCE, sha256File(helloWorldTarball()))
  } finally { await boot1.close() }

  const boot2 = await launchStateShell({ rootDir: root, bundles: BASE_BUNDLES })
  try {
    expect(readProfileBundles(boot2.profileDir)).not.toContain(HELLO_WORLD)
    expect(existsSync(join(boot2.profileDir, 'node_modules', ...HELLO_WORLD.split('/')))).toBe(false)
  } finally { await boot2.close() }

  const boot3 = await launchStateShell({
    rootDir: root,
    bundles: [...BASE_BUNDLES, { name: HELLO_WORLD, source: SOURCE }],
    stageTarballs: [{ at: STAGED_AT, from: helloWorldTarball() }],
  })
  try {
    // Output: re-assembly reproduces the first-boot state exactly.
    await expectMaterialized(boot3.profileDir, HELLO_WORLD, SOURCE, sha256File(helloWorldTarball()))
    expect(readProfileBundles(boot3.profileDir)).toEqual([...BASE_BUNDLES.map(b => b.name), HELLO_WORLD])
    const firstMarker = readSeedMarker(boot3.profileDir, HELLO_WORLD)
    expect(firstMarker?.sha256).toBe(sha256File(helloWorldTarball()))
  } finally { await boot3.close() }
})

test('step-5/repeated-cycle-idempotent: two add/remove cycles converge with zero cumulative residue', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)
  testInfo.annotations.push({
    type: 'note',
    description: '可重复生命周期操作: after >=2 full cycles the profile equals the never-cycled expectation — no orphan markers, no duplicate manifest entries, no scratch dirs.',
  })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-cycles-'))
  for (let cycle = 0; cycle < 2; cycle++) {
    const add = await launchStateShell({
      rootDir: root,
      bundles: [...BASE_BUNDLES, { name: HELLO_WORLD, source: SOURCE }],
      stageTarballs: [{ at: STAGED_AT, from: helloWorldTarball() }],
    })
    try {
      await expectMaterialized(add.profileDir, HELLO_WORLD, SOURCE, sha256File(helloWorldTarball()))
      expect(readProfileBundles(add.profileDir).filter(name => name === HELLO_WORLD)).toHaveLength(1)
    } finally { await add.close() }
    const remove = await launchStateShell({ rootDir: root, bundles: BASE_BUNDLES })
    try {
      expect(readProfileBundles(remove.profileDir)).toEqual(BASE_BUNDLES.map(b => b.name))
    } finally { await remove.close() }
  }

  // No residue anywhere in the profile after the cycles.
  const finalBoot = await launchStateShell({
    rootDir: root,
    bundles: [...BASE_BUNDLES, { name: HELLO_WORLD, source: SOURCE }],
    stageTarballs: [{ at: STAGED_AT, from: helloWorldTarball() }],
  })
  try {
    const markers = collectFiles(finalBoot.profileDir, '.dsh-forge-seed.json')
    expect(markers).toHaveLength(1) // exactly the re-added entry, no orphans
    const scratch = readdirSync(join(finalBoot.profileDir)).filter(name => name.startsWith('.dsh-forge-seed-'))
    expect(scratch).toEqual([])
    expect(readProfileBundles(finalBoot.profileDir)).toEqual([...BASE_BUNDLES.map(b => b.name), HELLO_WORLD])
  } finally { await finalBoot.close() }
})

test('step-5/marker-orphan-converge: a stale marker that no longer matches the config converges by rebuild', async ({ }, testInfo) => {
  testInfo.setTimeout(240_000)
  testInfo.annotations.push({
    type: 'note',
    description: 'Orphan fixture = a leftover marker whose source/sha no longer match the config entry (partial-cleanup residue). FT-018: marker mismatch (bundle/source/sha) forces convergence — the stale marker can never pin a wrong "already seeded" skip.',
  })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-orphan-'))
  const boot1 = await launchStateShell({
    rootDir: root,
    bundles: [...BASE_BUNDLES, { name: HELLO_WORLD, source: SOURCE }],
    stageTarballs: [{ at: STAGED_AT, from: helloWorldTarball() }],
  })
  try {
    await expectMaterialized(boot1.profileDir, HELLO_WORLD, SOURCE, sha256File(helloWorldTarball()))
  } finally { await boot1.close() }

  // Simulate the partial-cleanup residue: the tree is gutted but a stale
  // marker (wrong source + wrong sha) survives inside it.
  const materialized = join(boot1.profileDir, 'node_modules', ...HELLO_WORLD.split('/'))
  for (const entry of readdirSync(materialized)) {
    if (entry !== '.dsh-forge-seed.json' && entry !== 'package.json') {
      rmSync(join(materialized, entry), { recursive: true, force: true })
    }
  }
  writeFileSync(join(materialized, '.dsh-forge-seed.json'), `${JSON.stringify({
    bundle: HELLO_WORLD,
    source: 'tarball:plugin-tarballs/stale-never-existed.tgz',
    sha256: 'deadbeef'.repeat(8),
    seededAt: '2020-01-01T00:00:00.000Z',
  }, undefined, 2)}\n`)

  const boot2 = await launchStateShell({
    rootDir: root,
    bundles: [...BASE_BUNDLES, { name: HELLO_WORLD, source: SOURCE }],
    stageTarballs: [{ at: STAGED_AT, from: helloWorldTarball() }],
  })
  try {
    // Output: the orphan is recognized and converges — materialization fully
    // rebuilt from the current artifact, marker rewritten with the true sha.
    await expectMaterialized(boot2.profileDir, HELLO_WORLD, SOURCE, sha256File(helloWorldTarball()))
    expect(existsSync(join(materialized, 'lib', 'index.js')), 'rebuilt artifact tree').toBe(true)
    const marker = readSeedMarker(boot2.profileDir, HELLO_WORLD)
    expect(marker?.source).toBe(SOURCE)
  } finally { await boot2.close() }
})

/** Recursively collect file paths whose basename equals `name`. */
function collectFiles(dir: string, name: string): string[] {
  const found: string[] = []
  const walk = (current: string): void => {
    if (!existsSync(current)) return
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name === name) found.push(full)
    }
  }
  walk(dir)
  return found
}
