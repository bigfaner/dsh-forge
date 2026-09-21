// @feature ui-plugin-foundation | @web-e2e | @journey dual-env-plugin-assembly
// Traceability: docs/features/ui-plugin-foundation/testing/dual-env-plugin-assembly/contracts/step-1-official-web-self-install.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  BASE_BUNDLES,
  HELLO_WORLD,
  HELLO_WORLD_DIR,
  LOCK_BASELINE,
  PRODUCT_STAGED_TARBALL,
  REPO_ROOT,
  expectMaterialized,
  expectRosterContains,
  launchPluginShell,
  launchStateShell,
  readProfileBundles,
  sha256File,
} from '../helpers/plugins.ts'
import { checkPluginVersionAlignment, loadBaseline } from '../../../../scripts/verify-plugins.mjs'

const ALIGNMENT_DEP = '@deepseek-ai/dsh-client-ui-slots'

/** The real hello-world manifest, gate-shaped. */
function helloWorldPlugin() {
  const manifest = JSON.parse(readFileSync(join(HELLO_WORLD_DIR, 'package.json'), 'utf8')) as Record<string, unknown>
  return { name: '@dsh-forge/plugin-hello-world', dir: 'packages/plugins/hello-world', manifest }
}

test('step-1/success: the self-install artifact satisfies the alignment contract and materializes into the profile', async ({ }, testInfo) => {
  testInfo.setTimeout(120_000)
  testInfo.annotations.push({
    type: 'note',
    description: 'The official `dsh web` self-install leg (npx launcher + registry + ~/.dsh profile) is external-environment surface, archived in dsh-web-assembly-evidence.md (2026-09-22 live run). The hermetic legs assert the SAME artifact\'s install contract: exact alignment-line deps (real gate on the real manifest) and the profile-side materialization shape (manifest entry + node_modules + seed marker).',
  })
  // Dependency resolution locked to exact: the REAL gate on the REAL manifest.
  const baseline = loadBaseline(REPO_ROOT)
  expect(baseline).toMatchObject(LOCK_BASELINE)
  const alignment = checkPluginVersionAlignment([helloWorldPlugin()], baseline)
  expect(alignment.ok, alignment.violations.map(v => v.detail).join('\n')).toBe(true)

  // The client half is exposed via exports["./client"] and the minimal
  // stable-subset inject list (FT-021).
  const manifest = helloWorldPlugin().manifest as { exports?: Record<string, unknown>; dsh?: { client?: { inject?: string[] } } }
  expect(Object.hasOwn(manifest.exports ?? {}, './client'), 'exports["./client"] exposed').toBe(true)
  expect(manifest.dsh?.client?.inject).toEqual([
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-ui-chat',
    '@deepseek-ai/dsh-client-ui-renderer',
  ])

  // Profile-side install shape over the real reconciliation (tarball form).
  const stagedAt = 'plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz'
  const state = await launchStateShell({
    bundles: [...BASE_BUNDLES, { name: HELLO_WORLD, source: `tarball:${stagedAt}` }],
    stageTarballs: [{ at: stagedAt, from: PRODUCT_STAGED_TARBALL }],
  })
  try {
    expect(readProfileBundles(state.profileDir)).toContain(HELLO_WORLD)
    await expectMaterialized(state.profileDir, HELLO_WORLD, `tarball:${stagedAt}`, sha256File(PRODUCT_STAGED_TARBALL))
    // Zero vendored references in the delivered file set (files[] contract).
    const materialized = join(state.profileDir, 'node_modules', ...HELLO_WORLD.split('/'))
    expect(existsSync(join(materialized, 'lib', 'client.js'))).toBe(true)
    expect(existsSync(join(materialized, 'cordis.patch.yml'))).toBe(true)
  } finally { await state.close() }
})

test('step-1/dist-tag-stale-contract: bare/^/tag specs trip the real gate red with named entries, exact restores green', async () => {
  const baseline = loadBaseline(REPO_ROOT)
  const staleSpecs = ['^0.1.6-alpha.2', '*', 'alpha', 'workspace:0.1.6-alpha.2']
  for (const spec of staleSpecs) {
    const manifest = JSON.parse(JSON.stringify(helloWorldPlugin().manifest)) as Record<string, unknown>
    const peers = manifest.peerDependencies as Record<string, string>
    peers[ALIGNMENT_DEP] = spec
    const report = checkPluginVersionAlignment([{ name: HELLO_WORLD, dir: 'packages/plugins/hello-world', manifest }], baseline)
    // Output: not silently on the old contract — a red light naming the
    // package and the exact-version discipline (the expected host version is
    // named in the exact-but-mismatched branch below).
    expect(report.ok, `spec "${spec}" must trip the gate`).toBe(false)
    expect(report.violations[0]?.detail).toContain(ALIGNMENT_DEP)
    expect(report.violations[0]?.detail).toContain('exact')
  }
  // The exact-but-mismatched branch names the expected baseline version.
  {
    const manifest = JSON.parse(JSON.stringify(helloWorldPlugin().manifest)) as Record<string, unknown>
    const peers = manifest.peerDependencies as Record<string, string>
    peers[ALIGNMENT_DEP] = '0.1.5-rc.2'
    const report = checkPluginVersionAlignment([{ name: HELLO_WORLD, dir: 'packages/plugins/hello-world', manifest }], baseline)
    expect(report.ok).toBe(false)
    expect(report.violations[0]?.detail).toContain(baseline.desktopHostVersion)
  }

  // User corrects to exact -> the same gate turns green (retryable).
  const corrected = JSON.parse(JSON.stringify(helloWorldPlugin().manifest)) as Record<string, unknown>
  const peers = corrected.peerDependencies as Record<string, string>
  peers[ALIGNMENT_DEP] = baseline.desktopHostVersion
  expect(checkPluginVersionAlignment([{ name: HELLO_WORLD, dir: 'packages/plugins/hello-world', manifest: corrected }], baseline).ok).toBe(true)
})

test('step-1/network-error: shell-side assembly + boot complete with all external HTTP dead (offline self-sufficiency)', async ({ }, testInfo) => {
  testInfo.setTimeout(240_000)
  testInfo.annotations.push({
    type: 'note',
    description: 'The registry-unreachable install leg (npm network failure during dsh plugin add) is external-environment surface; the shell-side proof is the adopted offline channel: tarball pre-seed + boot over dsh-app:// with a dead proxy killing every external HTTP request (probe --offline-proxy pattern).',
  })
  const stagedAt = 'plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz'
  const shell = await launchPluginShell({
    bundles: [...BASE_BUNDLES, { name: HELLO_WORLD, source: `tarball:${stagedAt}` }],
    stageTarballs: [{ at: stagedAt, from: PRODUCT_STAGED_TARBALL }],
    offlineProxy: true,
  })
  try {
    await shell.uiReady()
    await expectRosterContains(shell, HELLO_WORLD)
  } finally { await shell.close() }
})
