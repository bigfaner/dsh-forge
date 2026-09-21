// @feature ui-plugin-foundation | @web-e2e | @journey dual-env-plugin-assembly
// Journey smoke test (happy path): self-install contract -> consume slot ->
// contribute sub-slot -> interaction wiring -> shell config assembly ->
// packaged/offline boot, success Outcomes in sequence.
// Traceability: docs/features/ui-plugin-foundation/testing/dual-env-plugin-assembly/contracts/step-{1..6}-*.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  BASE_BUNDLES,
  HELLO_WORLD,
  HELLO_WORLD_DIR,
  PRODUCT_STAGED_TARBALL,
  REPO_ROOT,
  expectMaterialized,
  expectRosterContains,
  launchPluginShell,
  sha256File,
} from '../helpers/plugins.ts'
import { checkPluginVersionAlignment, loadBaseline } from '../../../../scripts/verify-plugins.mjs'

const STAGED_AT = 'plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz'
const SOURCE = `tarball:${STAGED_AT}`

test('dual-env-plugin-assembly journey smoke: install contract -> slots -> wiring -> shell assembly -> offline boot', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)

  // Step 1 — the artifact passes the alignment contract (exact deps).
  const manifest = JSON.parse(readFileSync(join(HELLO_WORLD_DIR, 'package.json'), 'utf8')) as Record<string, unknown>
  const gate = checkPluginVersionAlignment([{ name: HELLO_WORLD, dir: 'packages/plugins/hello-world', manifest }], loadBaseline(REPO_ROOT))
  expect(gate.ok, gate.violations.map(v => v.detail).join('\n')).toBe(true)

  // Steps 2-4 observables ride the one real-chain boot below (roster carries
  // the assembly; slot declarations + interaction wiring live in the artifact).
  const builtClient = readFileSync(join(HELLO_WORLD_DIR, 'lib', 'client.js'), 'utf8')
  expect(builtClient).toContain('conversation.chat.assistant-actions') // step 2: consumed core slot
  expect(builtClient).toContain('hello-world.panel') // step 3: contributed sub-slot
  expect(builtClient).toContain('sayHello') // step 4: live interaction loop

  // Step 5 — the same plugin assembles in the shell through the config path.
  const shell = await launchPluginShell({
    bundles: [...BASE_BUNDLES, { name: HELLO_WORLD, source: SOURCE }],
    stageTarballs: [{ at: STAGED_AT, from: PRODUCT_STAGED_TARBALL }],
  })
  try {
    await expectRosterContains(shell, HELLO_WORLD)
    await expectMaterialized(shell.profileDir, HELLO_WORLD, SOURCE, sha256File(PRODUCT_STAGED_TARBALL))
    await expect(shell.page.getByRole('button', { name: /新建会话|New Session/ }).first()).toBeVisible()
  } finally { await shell.close() }

  // Step 6 — the adopted distribution form boots fully offline.
  const offline = await launchPluginShell({
    bundles: [...BASE_BUNDLES, { name: HELLO_WORLD, source: SOURCE }],
    stageTarballs: [{ at: STAGED_AT, from: PRODUCT_STAGED_TARBALL }],
    offlineProxy: true,
  })
  try {
    await offline.uiReady()
    await expectRosterContains(offline, HELLO_WORLD)
  } finally { await offline.close() }
})
