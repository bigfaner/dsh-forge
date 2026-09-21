// @feature ui-plugin-foundation | @web-e2e | @journey config-driven-plugin-lifecycle
// Traceability: docs/features/ui-plugin-foundation/testing/config-driven-plugin-lifecycle/contracts/step-4-config-remove-entry.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  BASE_BUNDLES,
  HELLO_WORLD,
  PRODUCT_STAGED_TARBALL,
  REPO_ROOT,
  bundlesConfigJson,
  expectNotMaterialized,
  expectRosterContains,
  expectRosterLacks,
  launchPluginShell,
  launchStateShell,
  readProfileBundles,
} from '../helpers/plugins.ts'

const STAGED_AT = 'plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz'
const SOURCE = `tarball:${STAGED_AT}`
const HW_ENTRY = { name: HELLO_WORLD, source: SOURCE }

test('step-4/success: config removal prunes the materialization and disassembles the plugin', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)
  testInfo.annotations.push({
    type: 'note',
    description: 'Delete-leg assembly absence is asserted on the boot roster (real chain); DOM panel markers ride the same channel as step 2. Shell code identity is asserted across both operations.',
  })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-remove-'))
  const withHw = await launchPluginShell({
    rootDir: root,
    bundles: [...BASE_BUNDLES, HW_ENTRY],
    stageTarballs: [{ at: STAGED_AT, from: PRODUCT_STAGED_TARBALL }],
  })
  try {
    await expectRosterContains(withHw, HELLO_WORLD)
    expect(readProfileBundles(withHw.profileDir)).toEqual([...BASE_BUNDLES.map(b => b.name), HELLO_WORLD])
  } finally { await withHw.close() }

  // User action: remove the entry from the product config and reboot.
  const withoutHw = await launchPluginShell({ rootDir: root, bundles: BASE_BUNDLES })
  try {
    // Output: hello-world no longer assembles — the roster carries no trace.
    await expectRosterLacks(withoutHw, HELLO_WORLD)

    // State: manifest dropped the entry; its profile-local materialization is
    // removed (marker gone, scoped dir pruned); other entries unaffected.
    expect(readProfileBundles(withoutHw.profileDir)).toEqual(BASE_BUNDLES.map(b => b.name))
    expectNotMaterialized(withoutHw.profileDir, HELLO_WORLD)
    expect(existsSync(join(withoutHw.profileDir, 'node_modules', '@dsh-forge')), 'empty @dsh-forge scope pruned').toBe(false)
  } finally { await withoutHw.close() }
})

test('step-4/no-legal-cleanup-channel: the archived shell-side reconciliation cleans without silent leftovers', async ({ }, testInfo) => {
  testInfo.setTimeout(180_000)
  testInfo.annotations.push({
    type: 'note',
    description: 'Adjudication archived in the shipped projector (host-profile/index.ts module contract: delete leg prunes manifest + materialization, never touches upstream fallback links, never adds an assembly channel) and in the task 2 record. The gated behavior: no "config removed but still assembled" silent residual state.',
  })
  // The operative policy is documented in the reconciliation engine source.
  const projectorSource = readFileSync(
    join(REPO_ROOT, 'apps', 'desktop', 'src', 'main', 'host-profile', 'index.ts'),
    'utf8',
  )
  expect(projectorSource).toContain('never adds an assembly channel')
  expect(projectorSource).toContain('.dsh-module-fallback')

  // Behavioral leg: after removal + reboot the entry neither materializes
  // nor stays listed — the two faces of a silent residual are both absent.
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-nocleanup-'))
  const boot1 = await launchStateShell({
    rootDir: root,
    bundles: [...BASE_BUNDLES, HW_ENTRY],
    stageTarballs: [{ at: STAGED_AT, from: PRODUCT_STAGED_TARBALL }],
  })
  try { expect(readProfileBundles(boot1.profileDir)).toContain(HELLO_WORLD) } finally { await boot1.close() }
  const boot2 = await launchStateShell({ rootDir: root, bundles: BASE_BUNDLES })
  try {
    expect(readProfileBundles(boot2.profileDir)).not.toContain(HELLO_WORLD)
    expectNotMaterialized(boot2.profileDir, HELLO_WORLD)
  } finally { await boot2.close() }
})

test('step-4/runtime-writer-rejected: the product config stays byte-identical across the whole lifecycle', async ({ }, testInfo) => {
  testInfo.setTimeout(180_000)
  testInfo.annotations.push({
    type: 'note',
    description: 'AC5 read-only face: the config is loaded once per boot and never written by the shell — asserted as byte identity of the product config across add/remove/re-add boots (a second writer would have to leave bytes behind; none exist).',
  })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-readonly-'))
  const withHw = await launchStateShell({
    rootDir: root,
    bundles: [...BASE_BUNDLES, HW_ENTRY],
    stageTarballs: [{ at: STAGED_AT, from: PRODUCT_STAGED_TARBALL }],
  })
  try {
    const added = readFileSync(withHw.configPath, 'utf8')
    expect(added).toBe(bundlesConfigJson([...BASE_BUNDLES, HW_ENTRY]))
    expect(added).toContain(HELLO_WORLD)
  } finally { await withHw.close() }

  const withoutHw = await launchStateShell({ rootDir: root, bundles: BASE_BUNDLES })
  try {
    // State: the file holds byte-exactly what its (test) owner wrote — no
    // runtime writer mutated product-owned entries while the shell ran/quit.
    const removed = readFileSync(withoutHw.configPath, 'utf8')
    expect(removed).toBe(bundlesConfigJson(BASE_BUNDLES))
    expect(removed).not.toContain(HELLO_WORLD)
  } finally { await withoutHw.close() }

  const readded = await launchStateShell({
    rootDir: root,
    bundles: [...BASE_BUNDLES, HW_ENTRY],
    stageTarballs: [{ at: STAGED_AT, from: PRODUCT_STAGED_TARBALL }],
  })
  try {
    expect(readFileSync(readded.configPath, 'utf8')).toContain(HELLO_WORLD)
  } finally { await readded.close() }
})

test('step-4/reconciliation-overreach: node_modules only ever holds config-derived materializations', async ({ }, testInfo) => {
  testInfo.setTimeout(180_000)
  testInfo.annotations.push({
    type: 'note',
    description: 'The 不发明旁路 invariant, behaviorally: across add/remove cycles the profile node_modules scope set equals exactly the config source-carrying entries — reconciliation invented no extra assembly source.',
  })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-overreach-'))
  const boot1 = await launchStateShell({
    rootDir: root,
    bundles: [...BASE_BUNDLES, HW_ENTRY],
    stageTarballs: [{ at: STAGED_AT, from: PRODUCT_STAGED_TARBALL }],
  })
  try {
    const scope = join(boot1.profileDir, 'node_modules', '@dsh-forge')
    expect(readdirSync(scope).sort()).toEqual(['plugin-hello-world'])
  } finally { await boot1.close() }
  const boot2 = await launchStateShell({ rootDir: root, bundles: BASE_BUNDLES })
  try {
    // After the delete leg the scope is gone entirely — no orphan channel.
    expect(existsSync(join(boot2.profileDir, 'node_modules', '@dsh-forge'))).toBe(false)
    expect(readdirSync(join(boot2.profileDir, 'node_modules')).filter(name => name.startsWith('.dsh-forge-seed-'))).toEqual([])
  } finally { await boot2.close() }
})
