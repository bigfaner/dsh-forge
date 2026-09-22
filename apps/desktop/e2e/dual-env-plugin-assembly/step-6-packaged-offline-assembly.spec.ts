// @feature ui-plugin-foundation | @web-e2e | @journey dual-env-plugin-assembly
// Traceability: docs/features/ui-plugin-foundation/testing/dual-env-plugin-assembly/contracts/step-6-packaged-offline-assembly.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  BASE_BUNDLES,
  HELLO_WORLD,
  HELLO_WORLD_DIR,
  helloWorldTarball,
  REPO_ROOT,
  expectMaterialized,
  expectRecoveryFailed,
  expectRosterContains,
  launchPluginShell,
  launchStateShell,
  sha256File,
} from '../helpers/plugins.ts'
import { scanArtifactModuleSources } from '../../../../scripts/verify-plugins.mjs'

const STAGED_AT = 'plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz'
const SOURCE = `tarball:${STAGED_AT}`

test('step-6/success: the adopted distribution form assembles and boots fully offline, artifact scan green', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)
  testInfo.annotations.push({
    type: 'note', description: 'Adopted form (spike §4.1): tarball built-in + shell-side pre-seeding. Offline proof = dead-proxy boot (all external HTTP fails; the dsh-app:// custom protocol must not) — the probe --offline-proxy pattern on the packaged-leg NFR. Packaged-exe probe (--executable) evidence is archived in shell-assembly-packaged-evidence.md.',
  })
  const shell = await launchPluginShell({
    bundles: [...BASE_BUNDLES, { name: HELLO_WORLD, source: SOURCE }],
    stageTarballs: [{ at: STAGED_AT, from: helloWorldTarball() }],
    offlineProxy: true,
  })
  try {
    await shell.uiReady()
    await expectRosterContains(shell, HELLO_WORLD)
    await expectMaterialized(shell.profileDir, HELLO_WORLD, SOURCE, sha256File(helloWorldTarball()))
  } finally { await shell.close() }

  // Artifact-level module-source scan over the real delivered file set: any
  // module resolving into the vendor tree would be red — this is green.
  const artifactFiles = ['lib/index.js', 'lib/client.js'].map(rel => ({
    path: join(HELLO_WORLD_DIR, rel),
    code: readFileSync(join(HELLO_WORLD_DIR, rel), 'utf8'),
  }))
  const scan = scanArtifactModuleSources({ name: HELLO_WORLD, dir: 'packages/plugins/hello-world' }, artifactFiles, REPO_ROOT)
  expect(scan.ok, scan.violations.map(v => v.detail).join('\n')).toBe(true)
})

test('step-6/offline-nfr-conflict: the conflict adjudication is archived — npm materialization rejected, offline form adopted', async () => {
  const spike = readFileSync(join(REPO_ROOT, 'docs', 'features', 'ui-plugin-foundation', 'spike-report.md'), 'utf8')
  expect(spike).toContain('tarball 随包内置')
  expect(spike).toContain('预播种')
  expect(spike).toContain('离线自足')
  expect(spike).toContain('否决')
})

test('step-6/staged-artifact-name-mismatch: --check is green on the real tree; a config/staged basename mismatch fails loud at both gates', async ({ }, testInfo) => {
  testInfo.setTimeout(180_000)
  testInfo.annotations.push({
    type: 'note', description: 'stage-plugin-tarballs.mjs executes main() at import (module side effect), so the planner is driven via its CLI + shipped source: (a) the real tree passes --check; (b) the build channel\'s basename guard is present in the shipped script; (c) the runtime gate (startup reconciliation) fails loud for a config entry whose artifact basename is absent — the version-bump-not-synced boundary.',
  })
  // (a) Real tree: the CLI check is green — with the default config carrying
  // no tarball-sourced entries (the demo plugin is not a default product
  // bundle), green is the explicit empty-plan no-op, not artifact presence.
  const green = spawnSync('node', ['scripts/stage-plugin-tarballs.mjs', '--check'], { cwd: REPO_ROOT, encoding: 'utf8' })
  expect(green.status, green.stderr ?? green.stdout).toBe(0)
  expect(green.stdout).toContain('no tarball-sourced entries in the product config')

  // (b) The build channel carries the basename-equality guard verbatim.
  const stageSource = readFileSync(join(REPO_ROOT, 'scripts', 'stage-plugin-tarballs.mjs'), 'utf8')
  expect(stageSource).toContain('does not match the config-declared')

  // (c) Runtime gate: a bumped config basename with no staged artifact is a
  // loud startup failure — never a silent wrong-version install.
  const state = await launchStateShell({
    bundles: [...BASE_BUNDLES, { name: HELLO_WORLD, source: 'tarball:plugin-tarballs/dsh-forge-plugin-hello-world-0.2.0.tgz' }],
  })
  try {
    await expectRecoveryFailed(state.fixture.page)
  } finally { await state.close() }
})
