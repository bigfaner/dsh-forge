// @feature ui-plugin-foundation | @web-e2e | @journey third-party-template-onboarding
// Traceability: docs/features/ui-plugin-foundation/testing/third-party-template-onboarding/contracts/step-5-view-injection-result.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { BASE_BUNDLES, HELLO_WORLD, PRODUCT_STAGED_TARBALL, REPO_ROOT, expectRosterContains, launchPluginShell } from '../helpers/plugins.ts'
import { checkVersionStamps, loadBaseline, makeVersionStamp } from '../../../../scripts/verify-plugins.mjs'

const STAGED_AT = 'plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz'

test('step-5/success: the injection result is observable — shell side live, official side archived', async ({ }, testInfo) => {
  testInfo.setTimeout(240_000)
  testInfo.annotations.push({
    type: 'note', description: 'Zero shell modification + zero vendored reference on both faces: the official-web rendering face is archived (dsh-web-assembly-evidence.md, live 2026-09-22); the shell face is asserted live here via the boot roster of a config-driven assembly.',
  })
  const official = readFileSync(join(REPO_ROOT, 'docs', 'features', 'ui-plugin-foundation', 'dsh-web-assembly-evidence.md'), 'utf8')
  expect(official).toContain('@dsh-forge/plugin-hello-world')

  const shell = await launchPluginShell({
    bundles: [...BASE_BUNDLES, { name: HELLO_WORLD, source: `tarball:${STAGED_AT}` }],
    stageTarballs: [{ at: STAGED_AT, from: PRODUCT_STAGED_TARBALL }],
  })
  try {
    await expectRosterContains(shell, HELLO_WORLD)
    await expect(shell.page.getByRole('button', { name: /新建会话|New Session/ }).first()).toBeVisible()
  } finally { await shell.close() }
})

test('step-5/template-stamp-drift: a stale stamp turns the same-source gate red; the lock bump is the upgrade reminder', async () => {
  const baseline = loadBaseline(REPO_ROOT)
  // The committed template stamp is in sync (same-source mechanism visible).
  const committed = checkVersionStamps(
    [{ name: 'template-plugin', dir: 'packages/templates/plugin', stamp: JSON.parse(readFileSync(join(REPO_ROOT, 'packages', 'templates', 'plugin', 'version-stamp.json'), 'utf8')) }],
    baseline,
  )
  expect(committed.ok, committed.violations.map(v => v.detail).join('\n')).toBe(true)

  // Simulate the drift: the lock baseline moved, the stamp did not follow.
  const upgraded = { ...baseline, desktopHostVersion: '0.1.7-alpha.0', pinnedSha: 'f'.repeat(40) }
  const staleStamp = makeVersionStamp(baseline) // pre-upgrade stamp
  const drifted = checkVersionStamps([{ name: 'template-plugin', dir: 'packages/templates/plugin', stamp: staleStamp }], upgraded)
  expect(drifted.ok).toBe(false)
  expect(drifted.violations.map(v => v.detail).join('\n')).toContain('stale')
  expect(drifted.violations.map(v => v.detail).join('\n')).toContain('same diff')
})
