// @feature ui-plugin-foundation | @web-e2e | @journey version-consistency-assertion
// Traceability: docs/features/ui-plugin-foundation/testing/version-consistency-assertion/contracts/step-3-template-stamp-visibility.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { LOCK_BASELINE, REPO_ROOT, TEMPLATE_DIR } from '../helpers/plugins.ts'
import { checkTemplateEngines, checkVersionStamps, loadBaseline, makeVersionStamp } from '../../../../scripts/verify-plugins.mjs'

const TEMPLATE_STAMP = JSON.parse(readFileSync(join(TEMPLATE_DIR, 'version-stamp.json'), 'utf8')) as Record<string, string>

test('step-3/success: the template-side version sync is visible and assertable through the same gate', async () => {
  const baseline = loadBaseline(REPO_ROOT)
  // The stamp equals the deterministic derivation from the lock (same source).
  expect(TEMPLATE_STAMP).toEqual(makeVersionStamp(baseline))
  // The stamp check rides the same gate family (green on the committed tree).
  const stamps = checkVersionStamps([{ name: '@dsh-forge/template-plugin', dir: 'packages/templates/plugin', stamp: TEMPLATE_STAMP }], baseline)
  expect(stamps.ok, stamps.violations.map(v => v.detail).join('\n')).toBe(true)
  // The engines declaration is lockstep with the same baseline.
  const engines = checkTemplateEngines(
    [{ name: '@dsh-forge/template-plugin', dir: 'packages/templates/plugin', manifest: JSON.parse(readFileSync(join(TEMPLATE_DIR, 'package.json'), 'utf8')) }],
    baseline,
  )
  expect(engines.ok, engines.violations.map(v => v.detail).join('\n')).toBe(true)
})

test('step-3/upgrade-bump-missed: a lock upgrade without the same-diff bump turns every face red', async () => {
  // The vendored baseline moved; stamp + engines + deps all still old.
  const upgraded = { ...loadBaseline(REPO_ROOT), desktopHostVersion: '0.1.7-alpha.0', pinnedSha: 'a'.repeat(40) }

  // Stamp face: stale — the red light IS the upgrade reminder.
  const stamps = checkVersionStamps([{ name: '@dsh-forge/template-plugin', dir: 'packages/templates/plugin', stamp: TEMPLATE_STAMP }], upgraded)
  expect(stamps.ok).toBe(false)
  expect(stamps.violations.map(v => v.detail).join('\n')).toContain('same diff')

  // Engines face: stale against the new host version.
  const engines = checkTemplateEngines(
    [{ name: '@dsh-forge/template-plugin', dir: 'packages/templates/plugin', manifest: JSON.parse(readFileSync(join(TEMPLATE_DIR, 'package.json'), 'utf8')) }],
    upgraded,
  )
  expect(engines.ok).toBe(false)
  expect(engines.violations.map(v => v.detail).join('\n')).toContain(LOCK_BASELINE.desktopHostVersion)

  // Aligning the bump (stamp regenerated + engines moved) restores green.
  const bumpedManifest = JSON.parse(readFileSync(join(TEMPLATE_DIR, 'package.json'), 'utf8')) as { engines?: Record<string, string> }
  bumpedManifest.engines = { '@deepseek-ai/dsh': upgraded.desktopHostVersion }
  const enginesGreen = checkTemplateEngines([{ name: '@dsh-forge/template-plugin', dir: 'packages/templates/plugin', manifest: bumpedManifest }], upgraded)
  expect(enginesGreen.ok).toBe(true)
  const stampsGreen = checkVersionStamps([{ name: '@dsh-forge/template-plugin', dir: 'packages/templates/plugin', stamp: makeVersionStamp(upgraded) }], upgraded)
  expect(stampsGreen.ok).toBe(true)
})
