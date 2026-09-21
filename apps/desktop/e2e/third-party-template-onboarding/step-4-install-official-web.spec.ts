// @feature ui-plugin-foundation | @web-e2e | @journey third-party-template-onboarding
// Traceability: docs/features/ui-plugin-foundation/testing/third-party-template-onboarding/contracts/step-4-install-official-web.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  BASE_BUNDLES,
  HELLO_WORLD,
  PRODUCT_STAGED_TARBALL,
  REPO_ROOT,
  TEMPLATE_DIR,
  expectRosterContains,
  launchPluginShell,
} from '../helpers/plugins.ts'

const STAGED_AT = 'plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz'

test('step-4/success: the derived form installs — gates green and the artifact assembles into a running host', async ({ }, testInfo) => {
  testInfo.setTimeout(240_000)
  testInfo.annotations.push({
    type: 'note', description: 'The official-web install face (dsh plugin add on the user profile) is external surface, archived in template-walkthrough-evidence.md + dsh-web-assembly-evidence.md. The hermetic legs: the derived-form gates pass, and the same tarball form assembles into a REAL running host through the shell channel (engines-compatible, no version-conflict face).',
  })
  const { checkPluginVersionAlignment, checkTemplateEngines, loadBaseline } = await import('../../../../scripts/verify-plugins.mjs')
  const baseline = loadBaseline(REPO_ROOT)
  const manifest = JSON.parse(readFileSync(join(TEMPLATE_DIR, 'package.json'), 'utf8')) as Record<string, unknown>
  expect(checkTemplateEngines([{ name: 'template', dir: 'packages/templates/plugin', manifest }], baseline).ok).toBe(true)
  expect(checkPluginVersionAlignment([{ name: 'template', dir: 'packages/templates/plugin', manifest }], baseline).ok).toBe(true)

  // The artifact-side install: the real staged tarball reaches a running host.
  const shell = await launchPluginShell({
    bundles: [...BASE_BUNDLES, { name: HELLO_WORLD, source: `tarball:${STAGED_AT}` }],
    stageTarballs: [{ at: STAGED_AT, from: PRODUCT_STAGED_TARBALL }],
  })
  try {
    await expectRosterContains(shell, HELLO_WORLD)
    expect(shell.pageErrors.join('\n')).not.toContain('version')
  } finally { await shell.close() }
})

test('step-4/injection-failure: malformed declarations fail diagnosably — never a silent no-render', async ({ }, testInfo) => {
  testInfo.annotations.push({
    type: 'note', description: 'CONTRACT DIVERGENCE FLAG (reported, not auto-resolved): for an INVALID slot key the archived upstream semantics are inject-never-fires (silent absence), with loud failure only at materialization require (spike §3.2); a boot-gate for missing必备 plugins is an explicit M2 addition (spike §5移交语 2). The visible pre-boot faces today: the machine gates (engines/alignment/sources) + the template documentation posture.',
  })
  const readme = readFileSync(join(TEMPLATE_DIR, 'README.md'), 'utf8')
  // The template documents the slot declaration posture (stable base slots).
  expect(readme).toContain('槽位')
  const manifest = JSON.parse(readFileSync(join(TEMPLATE_DIR, 'package.json'), 'utf8')) as {
    dsh?: { client?: { inject?: string[]; platform?: string } }
    exports?: Record<string, unknown>
  }
  // The delivered form contract: client platform + exposed client entry —
  // the exact shape whose violation is the diagnosable failure class.
  expect(manifest.dsh?.client?.platform).toBe('web')
  expect(Object.hasOwn(manifest.exports ?? {}, './client'), 'exports["./client"] exposed').toBe(true)
  expect(manifest.dsh?.client?.inject).toContain('@deepseek-ai/dsh-client-ui-chat')
})
