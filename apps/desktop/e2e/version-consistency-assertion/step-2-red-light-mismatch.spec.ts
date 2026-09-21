// @feature ui-plugin-foundation | @web-e2e | @journey version-consistency-assertion
// Traceability: docs/features/ui-plugin-foundation/testing/version-consistency-assertion/contracts/step-2-red-light-mismatch.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { HELLO_WORLD_DIR, LOCK_BASELINE, REPO_ROOT } from '../helpers/plugins.ts'
import { checkPluginVersionAlignment, loadBaseline, runGate } from '../../../../scripts/verify-plugins.mjs'

const ALIGNMENT_DEP = '@deepseek-ai/dsh-client-ui-renderer'

function helloWorldManifest(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(HELLO_WORLD_DIR, 'package.json'), 'utf8')) as Record<string, unknown>
}

test('step-2/success: a mismatched alignment dep trips the red light naming the entry; exact restores green', async ({ }, testInfo) => {
  testInfo.annotations.push({
    type: 'note', description: 'The mismatch reproduction is a TEMPORARY in-memory manifest edit (the gate is read-only over the tree; the engineering state is never modified) — the archived red-light reproduction with a real file edit lives in the task 4 record / version-gate evidence.',
  })
  const baseline = loadBaseline(REPO_ROOT)
  const green = runGate(REPO_ROOT)
  expect(green.ok).toBe(true) // baseline is green before the mismatch

  // Temporary mismatch: the gate goes red naming package + field + expected.
  const manifest = helloWorldManifest()
  const peers = manifest.peerDependencies as Record<string, string>
  peers[ALIGNMENT_DEP] = '0.1.5-rc.2'
  const red = checkPluginVersionAlignment([{ name: '@dsh-forge/plugin-hello-world', dir: 'packages/plugins/hello-world', manifest }], baseline)
  expect(red.ok).toBe(false)
  expect(red.violations[0]?.detail).toContain(ALIGNMENT_DEP)
  expect(red.violations[0]?.detail).toContain('peerDependencies')
  expect(red.violations[0]?.detail).toContain(baseline.desktopHostVersion)

  // Restore to exact: the same gate is green again (retryable verdict).
  peers[ALIGNMENT_DEP] = baseline.desktopHostVersion
  expect(checkPluginVersionAlignment([{ name: '@dsh-forge/plugin-hello-world', dir: 'packages/plugins/hello-world', manifest }], baseline).ok).toBe(true)
})

test('step-2/mutable-tag-redlight: a mutable dist-tag written into a dependency is red', async () => {
  const baseline = loadBaseline(REPO_ROOT)
  const manifest = helloWorldManifest()
  const peers = manifest.peerDependencies as Record<string, string>
  peers[ALIGNMENT_DEP] = 'alpha' // located the line via tag but never locked it
  const report = checkPluginVersionAlignment([{ name: '@dsh-forge/plugin-hello-world', dir: 'packages/plugins/hello-world', manifest }], baseline)
  expect(report.ok).toBe(false)
  // The violation names the discipline: resolve the tag, write the exact result.
  expect(report.violations[0]?.detail).toContain('alpha')
  expect(report.violations[0]?.detail).toContain('exact')

  // Discipline satisfied (tag resolved to its exact result): green.
  peers[ALIGNMENT_DEP] = LOCK_BASELINE.desktopHostVersion
  expect(checkPluginVersionAlignment([{ name: '@dsh-forge/plugin-hello-world', dir: 'packages/plugins/hello-world', manifest }], baseline).ok).toBe(true)
})
