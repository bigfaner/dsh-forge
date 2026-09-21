// @feature ui-plugin-foundation | @web-e2e | @journey third-party-template-onboarding
// Traceability: docs/features/ui-plugin-foundation/testing/third-party-template-onboarding/contracts/step-2-declare-versions.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { REPO_ROOT, TEMPLATE_DIR } from '../helpers/plugins.ts'
import { checkPluginVersionAlignment, checkTemplateEngines, loadBaseline, makeVersionStamp } from '../../../../scripts/verify-plugins.mjs'

const TEMPLATE_ENGINES_KEY = '@deepseek-ai/dsh'

/** The real template manifest, gate-shaped. */
function templateManifest() {
  return JSON.parse(readFileSync(join(TEMPLATE_DIR, 'package.json'), 'utf8')) as Record<string, unknown>
}

test('step-2/success: engines + exact alignment-line + visible stamp all pass the real gate', async () => {
  const baseline = loadBaseline(REPO_ROOT)
  const manifest = templateManifest()

  // engines-style host compatibility declared exact == desktopHostVersion.
  const engines = checkTemplateEngines([{ name: 'template', dir: 'packages/templates/plugin', manifest }], baseline)
  expect(engines.ok, engines.violations.map(v => v.detail).join('\n')).toBe(true)

  // Alignment-line deps exact; cordis on its own independent exact line.
  const alignment = checkPluginVersionAlignment([{ name: 'template', dir: 'packages/templates/plugin', manifest }], baseline)
  expect(alignment.ok, alignment.violations.map(v => v.detail).join('\n')).toBe(true)

  // The template stamp is visible via the same-source mechanism and equals
  // the deterministic stamp derived from the lock baseline.
  const stamp = JSON.parse(readFileSync(join(TEMPLATE_DIR, 'version-stamp.json'), 'utf8'))
  expect(stamp).toEqual(makeVersionStamp(baseline))
})

test('step-2/dist-tag-trap: bare/^/alpha specs on the alignment line are red, exact restores green', async () => {
  const baseline = loadBaseline(REPO_ROOT)
  const readme = readFileSync(join(TEMPLATE_DIR, 'README.md'), 'utf8')
  expect(readme).toContain('禁止裸包名、禁止 `^`/`~`/范围')

  for (const trap of ['^0.1.6-alpha.2', 'latest', 'alpha']) {
    const manifest = templateManifest()
    const peers = manifest.peerDependencies as Record<string, string>
    peers['@deepseek-ai/dsh-client-store'] = trap
    const report = checkPluginVersionAlignment([{ name: 'template', dir: 'packages/templates/plugin', manifest }], baseline)
    expect(report.ok, `trap "${trap}" must be red`).toBe(false)
    expect(report.violations[0]?.detail).toContain('exact')
  }
})

test('step-2/missing-engines: a derived package without the engines declaration fails visibly', async () => {
  const baseline = loadBaseline(REPO_ROOT)
  const manifest = templateManifest()
  delete (manifest as { engines?: unknown }).engines
  const report = checkTemplateEngines([{ name: 'template', dir: 'packages/templates/plugin', manifest }], baseline)
  // Visible, diagnosable, correctable — never a silent incompatible install.
  expect(report.ok).toBe(false)
  expect(report.violations[0]?.detail).toContain(TEMPLATE_ENGINES_KEY)
  expect(report.violations[0]?.detail).toContain('missing')
})
