// @feature ui-plugin-foundation | @web-e2e | @journey slot-collision-coexistence
// Traceability: docs/features/ui-plugin-foundation/testing/slot-collision-coexistence/contracts/step-1-hello-world-baseline.md
// SKIP_EVAL_GATE: generated without eval-contract verification. Review with extra scrutiny.
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  BASE_BUNDLES,
  HELLO_WORLD,
  PRODUCT_STAGED_TARBALL,
  REPO_ROOT,
  expectRosterContains,
  launchPluginShell,
} from '../helpers/plugins.ts'

const STAGED_AT = 'plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz'

function basePlus(entries: ReadonlyArray<{ name: string; source?: string }>) {
  return [...BASE_BUNDLES, ...entries]
}

test('step-1/success: hello-world baseline renders its slots without disturbing the host core surface', async ({ }, testInfo) => {
  testInfo.setTimeout(240_000)
  testInfo.annotations.push({
    type: 'note', description: 'Baseline = the single declarant state: roster carries hello-world, zero pageerrors attributable to it, and the ui-chat/ui-renderer-carried core surface stays alive. Panel markers on session turn-tails ride the probe channel.',
  })
  const shell = await launchPluginShell({
    bundles: basePlus([{ name: HELLO_WORLD, source: `tarball:${STAGED_AT}` }]),
    stageTarballs: [{ at: STAGED_AT, from: PRODUCT_STAGED_TARBALL }],
  })
  try {
    await expectRosterContains(shell, HELLO_WORLD)
    // Single-declarant baseline is clean: no plugin-attributable pageerror.
    await expect.poll(() => shell.pageErrors.join('\n'), { timeout: 15_000 }).not.toContain('hello-world')
    // Host core interface (ui-chat / ui-renderer faces) unaffected.
    await expect(shell.page.getByRole('button', { name: /新建会话|New Session/ }).first()).toBeVisible()
  } finally { await shell.close() }
})

test('step-1/core-slot-collision-splash: the host core surface survives third-party slot declarations in the tree', async ({ }, testInfo) => {
  testInfo.setTimeout(240_000)
  testInfo.annotations.push({
    type: 'note', description: 'The core-key collision axis (a plugin declaring a HOST base slot key) is pinned by the unit matrix against the real SlotCore (cells/ledger semantics) and the archived matrix; the e2e leg asserts the observable SC6 face: with third-party slot declarations assembled, the host core functionality surface stays usable.',
  })
  const shell = await launchPluginShell({
    bundles: basePlus([{ name: HELLO_WORLD, source: `tarball:${STAGED_AT}` }]),
    stageTarballs: [{ at: STAGED_AT, from: PRODUCT_STAGED_TARBALL }],
  })
  try {
    await shell.uiReady()
    await expectRosterContains(shell, HELLO_WORLD)
    // Core surface: the upstream GUI container keeps its primary affordances
    // and the shell overlay stack stays clean (no crash mask).
    await expect(shell.page.getByRole('button', { name: /新建会话|New Session/ }).first()).toBeVisible()
    await expect(shell.page.locator('#dsh-forge-crash-recovery')).toHaveCount(0)
    // The core-slot ground truth: the vendored ui-chat strip key the plugin
    // targets exists in the served environment (target region real).
    const { readFileSync } = await import('node:fs')
    const vendoredUiChat = readFileSync(
      join(REPO_ROOT, 'packages', 'desktop-host-vendor', 'vendored', 'packages', 'client', 'ui-chat', 'lib', 'client.js'),
      'utf8',
    )
    expect(vendoredUiChat).toContain('conversation.chat.assistant-actions')
  } finally { await shell.close() }
})
