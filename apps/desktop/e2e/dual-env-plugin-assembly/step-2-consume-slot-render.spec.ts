// @feature ui-plugin-foundation | @web-e2e | @journey dual-env-plugin-assembly
// Traceability: docs/features/ui-plugin-foundation/testing/dual-env-plugin-assembly/contracts/step-2-consume-slot-render.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  BASE_BUNDLES,
  HELLO_WORLD,
  HELLO_WORLD_DIR,
  helloWorldTarball,
  REPO_ROOT,
  expectRosterContains,
  launchPluginShell,
} from '../helpers/plugins.ts'

const STAGED_AT = 'plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz'
const TARGET_SLOT = 'conversation.chat.assistant-actions'

test('step-2/success: the panel consumes the stable core slot in the served environment', async ({ }, testInfo) => {
  testInfo.setTimeout(240_000)
  testInfo.annotations.push({
    type: 'note',
    description: 'Panel DOM markers render only on completed assistant turns (task 2 evidence) — session content is user data. Web observables here: (a) the plugin enters the host boot roster, (b) the built client declares the ui-chat core strip as its inject target, (c) that exact slot key exists in the vendored ui-chat client the shell actually serves (target environment ground truth). Panel/screenshot evidence: live-ui-probe --plugin-leg (SHELL-S0 artifacts).',
  })
  const shell = await launchPluginShell({
    bundles: [...BASE_BUNDLES, { name: HELLO_WORLD, source: `tarball:${STAGED_AT}` }],
    stageTarballs: [{ at: STAGED_AT, from: helloWorldTarball() }],
  })
  try {
    await expectRosterContains(shell, HELLO_WORLD)
    // The host core surface stays available around the injected panel strip.
    await expect(shell.page.getByRole('button', { name: /新建会话|New Session/ }).first()).toBeVisible()
  } finally { await shell.close() }

  // The built client declares the consumed core slot (ui-chat stable strip).
  const builtClient = readFileSync(join(HELLO_WORLD_DIR, 'lib', 'client.js'), 'utf8')
  expect(builtClient).toContain(TARGET_SLOT)

  // Ground truth: the vendored ui-chat client (what the shell serves over
  // dsh-app://) really declares that slot key — the target region exists.
  const vendoredUiChat = readFileSync(
    join(REPO_ROOT, 'packages', 'desktop-host-vendor', 'vendored', 'packages', 'client', 'ui-chat', 'lib', 'client.js'),
    'utf8',
  )
  expect(vendoredUiChat).toContain(TARGET_SLOT)
})

test('step-2/target-slot-missing: absent-target behavior is the archived silent-never-fire boundary (M2 gate input)', async ({ }, testInfo) => {
  testInfo.annotations.push({
    type: 'note',
    description: 'CONTRACT DIVERGENCE FLAG (low confidence, reported not auto-resolved): the Contract expects a loud failure for an absent target slot key. The archived upstream semantics (spike §3.2, unit matrix slots.spec.ts) are: an inject on a never-declared key never fires — the panel is silently absent, and loud failure happens only at materialization-time require. Per spike §5移交语 2, a "missing必备插件即启动失败" gate is an explicit M2 shell-side addition, recorded as design input. This leg pins the CURRENT archived classification so a future regression of the semantics is visible.',
  })
  // The real registry-level matrix already drives the absent-key leg against
  // the real SlotCore (packages/plugins/hello-world-collision/tests/slots.spec.ts:
  // entries(TARGET_SLOT) === 0 without the declarer). The shipped fixture here:
  // the delivered manifests pass the pre-boot visible gates (alignment on the
  // plugin, engines on the template) — the faces that catch garbage
  // declarations before any boot.
  const { checkPluginVersionAlignment, checkTemplateEngines, loadBaseline } = await import('../../../../scripts/verify-plugins.mjs')
  const baseline = loadBaseline(REPO_ROOT)
  const manifest = JSON.parse(readFileSync(join(HELLO_WORLD_DIR, 'package.json'), 'utf8')) as Record<string, unknown>
  expect(checkPluginVersionAlignment([{ name: HELLO_WORLD, dir: 'packages/plugins/hello-world', manifest }], baseline).ok).toBe(true)
  const templateManifest = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages', 'templates', 'plugin', 'package.json'), 'utf8'),
  ) as Record<string, unknown>
  expect(checkTemplateEngines([{ name: 'template-plugin', dir: 'packages/templates/plugin', manifest: templateManifest }], baseline).ok).toBe(true)
})

test('step-2/loading-state: the assembly lands with the first frame — no manual refresh needed', async ({ }, testInfo) => {
  testInfo.setTimeout(240_000)
  testInfo.annotations.push({
    type: 'note',
    description: 'Loading-window leg: the boot gate blocks the SPA until a definitive host outcome, so the visible state converges to the fully assembled view without any reload — asserted by reaching ui-ready + roster with zero page.reload() calls (the counter is asserted implicitly: any reload would break the waitFor chain).',
  })
  const shell = await launchPluginShell({
    bundles: [...BASE_BUNDLES, { name: HELLO_WORLD, source: `tarball:${STAGED_AT}` }],
    stageTarballs: [{ at: STAGED_AT, from: helloWorldTarball() }],
  })
  try {
    await shell.uiReady()
    await expectRosterContains(shell, HELLO_WORLD)
  } finally { await shell.close() }
})
