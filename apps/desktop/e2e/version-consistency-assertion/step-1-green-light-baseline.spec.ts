// @feature ui-plugin-foundation | @web-e2e | @journey version-consistency-assertion
// Traceability: docs/features/ui-plugin-foundation/testing/version-consistency-assertion/contracts/step-1-green-light-baseline.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
//
// Journey vehicle note (journey.md): the assertion's execution carrier is the
// CI/quality gate (vitest verify-plugins leg + pnpm verify:plugins) — the UI
// face is not involved; these Web E2E scripts drive the REAL gate functions
// over the REAL tree (read-only, no engineering state is modified).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { HELLO_WORLD_DIR, LOCK_BASELINE, REPO_ROOT } from '../helpers/plugins.ts'
import { checkPluginVersionAlignment, isExactVersion, loadBaseline, runGate } from '../../../../scripts/verify-plugins.mjs'

function helloWorldManifest(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(HELLO_WORLD_DIR, 'package.json'), 'utf8')) as Record<string, unknown>
}

test('step-1/success: the current tree runs the gate green (exact alignment, cordis single-lined)', async () => {
  // The real lock baseline is the comparison anchor.
  const baseline = loadBaseline(REPO_ROOT)
  expect(baseline).toMatchObject(LOCK_BASELINE)

  // The full real gate over the real workspace: plugins + templates + stamps
  // + artifacts — green.
  const gate = runGate(REPO_ROOT)
  expect(gate.ok, gate.violations.map(v => v.detail).join('\n')).toBe(true)

  // The alignment family is exact-pinned on the real plugin manifest.
  const peers = helloWorldManifest().peerDependencies as Record<string, string>
  for (const [name, spec] of Object.entries(peers)) {
    if (name.startsWith('@deepseek-ai/dsh-client-')) {
      expect(isExactVersion(spec), `${name} exact`).toBe(true)
      expect(spec).toBe(baseline.desktopHostVersion)
    }
  }
})

test('step-1/cordis-misfiled-false-positive: cordis is single-lined — a differing cordis version never trips the host comparison', async () => {
  const baseline = loadBaseline(REPO_ROOT)
  // The comparison-set boundary is explicit and stable in the real gate.
  const manifest = helloWorldManifest()
  const peers = manifest.peerDependencies as Record<string, string>

  // cordis on its own line at a DIFFERENT version than desktopHostVersion:
  // still green (independent line, exact-only check — no false positive).
  const cordisDrifted = { ...manifest, peerDependencies: { ...peers, '@deepseek-ai/cordis': '5.0.0' } }
  const cordisReport = checkPluginVersionAlignment([{ name: '@dsh-forge/plugin-hello-world', dir: 'packages/plugins/hello-world', manifest: cordisDrifted }], baseline)
  expect(cordisReport.ok, 'cordis drift must not be a host-comparison violation').toBe(true)

  // A dsh-client-* drift at ANY other exact version: red — the true signal
  // the boundary exists to protect.
  const clientDrifted = { ...manifest, peerDependencies: { ...peers, '@deepseek-ai/dsh-client-ui-chat': '0.1.6-alpha.1' } }
  const clientReport = checkPluginVersionAlignment([{ name: '@dsh-forge/plugin-hello-world', dir: 'packages/plugins/hello-world', manifest: clientDrifted }], baseline)
  expect(clientReport.ok).toBe(false)
})
