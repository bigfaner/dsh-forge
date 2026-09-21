// @feature ui-plugin-foundation | @web-e2e | @journey version-consistency-assertion
// Journey smoke test (happy path): green baseline -> deliberate mismatch red
// -> template stamp visibility, success Outcomes in sequence (read-only gate).
// Traceability: docs/features/ui-plugin-foundation/testing/version-consistency-assertion/contracts/step-{1..3}-*.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { HELLO_WORLD_DIR, REPO_ROOT, TEMPLATE_DIR } from '../helpers/plugins.ts'
import { checkPluginVersionAlignment, checkVersionStamps, loadBaseline, makeVersionStamp, runGate } from '../../../../scripts/verify-plugins.mjs'

test('version-consistency-assertion journey smoke: green -> red -> template-side sync', async () => {
  const baseline = loadBaseline(REPO_ROOT)

  // Step 1 — green: the full real gate passes on the current tree.
  const gate = runGate(REPO_ROOT)
  expect(gate.ok, gate.violations.map(v => v.detail).join('\n')).toBe(true)

  // Step 2 — red: a temporary mismatched alignment dep is named and red,
  // then exact restores the green verdict.
  const manifest = JSON.parse(readFileSync(join(HELLO_WORLD_DIR, 'package.json'), 'utf8')) as { peerDependencies?: Record<string, string> }
  const peers = { ...(manifest.peerDependencies ?? {}) }
  peers['@deepseek-ai/dsh-client-locale'] = '0.1.6-alpha.1'
  const red = checkPluginVersionAlignment([{ name: '@dsh-forge/plugin-hello-world', dir: 'packages/plugins/hello-world', manifest: { ...manifest, peerDependencies: peers } }], baseline)
  expect(red.ok).toBe(false)
  expect(red.violations[0]?.detail).toContain('@deepseek-ai/dsh-client-locale')
  peers['@deepseek-ai/dsh-client-locale'] = baseline.desktopHostVersion
  expect(checkPluginVersionAlignment([{ name: '@dsh-forge/plugin-hello-world', dir: 'packages/plugins/hello-world', manifest: { ...manifest, peerDependencies: peers } }], baseline).ok).toBe(true)

  // Step 3 — template-side sync visible through the same source.
  const stamp = JSON.parse(readFileSync(join(TEMPLATE_DIR, 'version-stamp.json'), 'utf8'))
  expect(stamp).toEqual(makeVersionStamp(baseline))
  expect(checkVersionStamps([{ name: '@dsh-forge/template-plugin', dir: 'packages/templates/plugin', stamp }], baseline).ok).toBe(true)
})
