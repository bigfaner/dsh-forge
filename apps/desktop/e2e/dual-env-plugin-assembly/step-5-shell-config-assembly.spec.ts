// @feature ui-plugin-foundation | @web-e2e | @journey dual-env-plugin-assembly
// Traceability: docs/features/ui-plugin-foundation/testing/dual-env-plugin-assembly/contracts/step-5-shell-config-assembly.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  BASE_BUNDLES,
  FORGE_WORKBENCH,
  FORGE_WORKBENCH_STAGED_AT,
  HELLO_WORLD,
  HELLO_WORLD_DIR,
  MAIN_PATH,
  helloWorldTarball,
  REPO_ROOT,
  expectMaterialized,
  expectRosterContains,
  launchPluginShell,
  readProfileBundles,
  sha256File,
} from '../helpers/plugins.ts'

const STAGED_AT = 'plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz'
const SOURCE = `tarball:${STAGED_AT}`

test('step-5/success: the same plugin assembles in the shell via the product config path', async ({ }, testInfo) => {
  testInfo.setTimeout(240_000)
  testInfo.annotations.push({
    type: 'note', description: 'Two-anchor resolution (host-profile projection + vendored install closure) and version alignment hold in the shell by construction — this launcher runs the real chain with only the profile/config seams redirected.',
  })
  const shell = await launchPluginShell({
    bundles: [...BASE_BUNDLES, { name: HELLO_WORLD, source: SOURCE }],
    stageTarballs: [{ at: STAGED_AT, from: helloWorldTarball() }],
  })
  try {
    await expectRosterContains(shell, HELLO_WORLD)
    expect(readProfileBundles(shell.profileDir)).toEqual([...BASE_BUNDLES.map(b => b.name), HELLO_WORLD])
    await expectMaterialized(shell.profileDir, HELLO_WORLD, SOURCE, sha256File(helloWorldTarball()))
  } finally { await shell.close() }
})

test('step-5/config-bypass-hardcode: zero plugin identity lives in the built shell artifact', async () => {
  // The compiled main must carry no plugin identity constant: names and
  // artifact paths come from the config alone (HOST_PROFILE_BUNDLES-style
  // welded lists are the defect class this gate rules out).
  const mainBundle = readFileSync(MAIN_PATH, 'utf8')
  expect(mainBundle).not.toContain(HELLO_WORLD)
  expect(mainBundle).not.toContain('@dsh-forge/plugin-')
  // And the committed product config really drives the default assembly:
  // the vendored-closure base entries plus the mandatory forge core plugin
  // (M2 3.2 — the first forge-core bundle ships in the product manifest).
  // The demo plugin stays a journey/test-only fixture, never a default.
  const productConfigPath = join(REPO_ROOT, 'apps', 'desktop', 'resources', 'plugin-bundles.json')
  const productBundles = (JSON.parse(readFileSync(productConfigPath, 'utf8')) as {
    bundles: Array<{ name: string; source?: string; mandatory?: boolean }>
  }).bundles
  expect(productBundles.map(entry => entry.name)).toEqual([...BASE_BUNDLES.map(entry => entry.name), FORGE_WORKBENCH])
  expect(productBundles[2]).toMatchObject({
    name: FORGE_WORKBENCH,
    source: `tarball:${FORGE_WORKBENCH_STAGED_AT}`,
    mandatory: true,
  })
  expect(readFileSync(productConfigPath, 'utf8')).not.toContain(HELLO_WORLD)
})

test('step-5/dual-env-divergence: shell-side and official-web-side evidence agree on the same plugin contract', async ({ }, testInfo) => {
  testInfo.setTimeout(240_000)
  testInfo.annotations.push({
    type: 'note', description: 'Dual-env consistency compares the shell boot against the archived official-web live run (dsh-web-assembly-evidence.md): same plugin identity, same inject declaration, same slot keys — divergence on any face would fail the portability verdict.',
  })
  const officialEvidence = readFileSync(
    join(REPO_ROOT, 'docs', 'features', 'ui-plugin-foundation', 'dsh-web-assembly-evidence.md'),
    'utf8',
  )
  const manifest = JSON.parse(readFileSync(join(HELLO_WORLD_DIR, 'package.json'), 'utf8')) as {
    name: string
    dsh?: { client?: { inject?: string[] } }
  }
  // Official-web side: the evidence records the plugin identity + the exact
  // inject subset + the slot keys it observed live.
  expect(officialEvidence).toContain(manifest.name as string)
  for (const edge of manifest.dsh?.client?.inject ?? []) {
    // The evidence cites the inject edges in their short package form.
    const short = edge.replace('@deepseek-ai/dsh-client-', '')
    expect(officialEvidence, `official-web evidence covers inject edge ${edge}`).toContain(short)
  }
  expect(officialEvidence).toContain('conversation.chat.assistant-actions')
  expect(officialEvidence).toContain('hello-world.panel')

  // Shell side: the same identity assembles through the config channel.
  const shell = await launchPluginShell({
    bundles: [...BASE_BUNDLES, { name: HELLO_WORLD, source: SOURCE }],
    stageTarballs: [{ at: STAGED_AT, from: helloWorldTarball() }],
  })
  try {
    await expectRosterContains(shell, HELLO_WORLD)
  } finally { await shell.close() }
})
