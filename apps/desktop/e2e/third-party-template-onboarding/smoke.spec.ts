// @feature ui-plugin-foundation | @web-e2e | @journey third-party-template-onboarding
// Journey smoke test (happy path): scaffold from the template -> declare
// versions -> build artifact contract -> install (gates + host assembly) ->
// observe the injection result, success Outcomes in sequence.
// Traceability: docs/features/ui-plugin-foundation/testing/third-party-template-onboarding/contracts/step-{1..5}-*.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { BASE_BUNDLES, HELLO_WORLD, HELLO_WORLD_DIR, PRODUCT_STAGED_TARBALL, REPO_ROOT, TEMPLATE_DIR, expectRosterContains, launchPluginShell } from '../helpers/plugins.ts'
import { checkPluginVersionAlignment, checkTemplateEngines, checkVersionStamps, loadBaseline, makeVersionStamp } from '../../../../scripts/verify-plugins.mjs'

const STAGED_AT = 'plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz'

test('third-party-template-onboarding journey smoke: scaffold -> declare -> build contract -> install -> inject', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)
  const baseline = loadBaseline(REPO_ROOT)
  const manifest = JSON.parse(readFileSync(join(TEMPLATE_DIR, 'package.json'), 'utf8')) as Record<string, unknown>

  // Step 1 — scaffold face: two halves, client entry, npm-form deps.
  expect(Object.hasOwn(manifest.exports ?? {}, './client'), 'exports["./client"] exposed').toBe(true)
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
    for (const spec of Object.values((manifest[field] as Record<string, string>) ?? {})) {
      expect(spec).not.toMatch(/^(workspace|file|link):/)
    }
  }

  // Step 2 — declaration face: engines exact + alignment exact + stamp sync.
  expect(checkTemplateEngines([{ name: 'template', dir: 'packages/templates/plugin', manifest }], baseline).ok).toBe(true)
  expect(checkPluginVersionAlignment([{ name: 'template', dir: 'packages/templates/plugin', manifest }], baseline).ok).toBe(true)
  const stamp = JSON.parse(readFileSync(join(TEMPLATE_DIR, 'version-stamp.json'), 'utf8'))
  expect(checkVersionStamps([{ name: 'template-plugin', dir: 'packages/templates/plugin', stamp }], baseline).ok).toBe(true)
  expect(stamp).toEqual(makeVersionStamp(baseline))

  // Step 3 — build contract face: complete artifact set on the reference build.
  for (const rel of ['lib/index.js', 'lib/client.js', 'cordis.patch.yml']) {
    expect(existsSync(join(HELLO_WORLD_DIR, rel)), rel).toBe(true)
  }

  // Step 4 + 5 — install + injection: the artifact reaches a running host
  // and the injection is observable on the boot roster.
  const shell = await launchPluginShell({
    bundles: [...BASE_BUNDLES, { name: HELLO_WORLD, source: `tarball:${STAGED_AT}` }],
    stageTarballs: [{ at: STAGED_AT, from: PRODUCT_STAGED_TARBALL }],
  })
  try {
    await expectRosterContains(shell, HELLO_WORLD)
    await expect(shell.page.getByRole('button', { name: /新建会话|New Session/ }).first()).toBeVisible()
  } finally { await shell.close() }
})
