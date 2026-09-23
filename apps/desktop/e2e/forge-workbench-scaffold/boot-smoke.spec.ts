// @feature dsh-forge-m2 | @web-e2e | @journey forge-workbench-scaffold
// Traceability: docs/features/dsh-forge-m2/tasks/3.2-forge-workbench-plugin-scaffold.md
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  BASE_BUNDLES,
  FORGE_WORKBENCH,
  FORGE_WORKBENCH_STAGED_AT,
  HELLO_WORLD,
  forgeWorkbenchTarball,
  helloWorldTarball,
  expectMaterialized,
  expectRosterContains,
  expectRosterLacks,
  launchPluginShell,
  readProfileBundles,
  sha256File,
} from '../helpers/plugins.ts'

// Task 3.2 boot smoke: the forge-workbench scaffold assembles through the
// product config channel (mandatory, tarball-sourced), boots beside the
// hello-world demo plugin (AC5 co-existence), registers its browser half
// without a renderer error (AC2/AC3), and the 3.1 dual-layer mandatory guard
// holds on the live chain (AC6): a hand-edited runtime overlay naming the
// mandatory bundle cannot hold it out, while a disabled third-party bundle
// still exits.

const HELLO_WORLD_STAGED_AT = 'plugin-tarballs/dsh-forge-plugin-hello-world-0.1.0.tgz'
/** The full scaffold config: base bundles + mandatory forge core + demo plugin. */
function scaffoldBundles() {
  return [
    ...BASE_BUNDLES,
    { name: FORGE_WORKBENCH, source: `tarball:${FORGE_WORKBENCH_STAGED_AT}`, mandatory: true } as const,
    { name: HELLO_WORLD, source: `tarball:${HELLO_WORLD_STAGED_AT}` } as const,
  ]
}
function scaffoldTarballs() {
  return [
    { at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() },
    { at: HELLO_WORLD_STAGED_AT, from: helloWorldTarball() },
  ]
}

/**
 * The probe-side Electron default userData dir (no env override exists for the
 * overlay path — the spike/task-6 userData-split finding): appData + /Electron.
 * The runtime overlay `<userData>/plugin-runtime.json` (task 3.1) lives there.
 */
function probeOverlayPath(): string {
  const appData = process.platform === 'win32'
    ? process.env.APPDATA
    : process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Application Support')
      : process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
  return join(appData ?? homedir(), 'Electron', 'plugin-runtime.json')
}

/** Write a runtime overlay (task 3.1 shape) and return its cleanup. */
function writeOverlay(disabled: string[]): () => void {
  const path = probeOverlayPath()
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, `${JSON.stringify({ disabled }, undefined, 2)}\n`)
  return () => { if (existsSync(path)) rmSync(path) }
}

test('3.2/boot-smoke: the mandatory scaffold assembles, boots, and co-exists with hello-world', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)
  const shell = await launchPluginShell({ bundles: scaffoldBundles(), stageTarballs: scaffoldTarballs() })
  try {
    await shell.uiReady()
    // The host half loaded (roster row) and the browser half registered —
    // no registration throw surfaced as a pageerror (the collision channel).
    await expectRosterContains(shell, FORGE_WORKBENCH)
    await expectRosterContains(shell, HELLO_WORLD)
    expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    // Profile state: all three bundles in the manifest, both plugins
    // materialized from their staged tarballs with seed markers.
    expect(readProfileBundles(shell.profileDir)).toEqual([
      ...BASE_BUNDLES.map(entry => entry.name), FORGE_WORKBENCH, HELLO_WORLD,
    ])
    await expectMaterialized(shell.profileDir, FORGE_WORKBENCH, `tarball:${FORGE_WORKBENCH_STAGED_AT}`, sha256File(forgeWorkbenchTarball()))
    await expectMaterialized(shell.profileDir, HELLO_WORLD, `tarball:${HELLO_WORLD_STAGED_AT}`, sha256File(helloWorldTarball()))
  } finally { await shell.close() }
})

test('3.2/mandatory-guard: the runtime overlay cannot hold out the mandatory bundle', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)
  // A hand-edited overlay names BOTH plugins: the mandatory forge core
  // (immune — the load-side guard strips it) and the third-party demo plugin
  // (held out through the delete leg).
  const cleanup = writeOverlay([FORGE_WORKBENCH])
  const shell = await launchPluginShell({ bundles: scaffoldBundles(), stageTarballs: scaffoldTarballs() })
  try {
    await shell.uiReady()
    await expectRosterContains(shell, FORGE_WORKBENCH)
    expect(readProfileBundles(shell.profileDir)).toContain(FORGE_WORKBENCH)
    await expectMaterialized(shell.profileDir, FORGE_WORKBENCH, `tarball:${FORGE_WORKBENCH_STAGED_AT}`, sha256File(forgeWorkbenchTarball()))
  } finally {
    await shell.close()
    cleanup()
  }
})

test('3.2/mandatory-guard-contrast: a disabled third-party bundle still exits while the core stays', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)
  const cleanup = writeOverlay([HELLO_WORLD])
  const shell = await launchPluginShell({ bundles: scaffoldBundles(), stageTarballs: scaffoldTarballs() })
  try {
    await shell.uiReady()
    await expectRosterContains(shell, FORGE_WORKBENCH)
    // Held out of the profile manifest → the host never assembles it (the
    // roster is the assembly observable). The tarball materialization itself
    // may stay seeded (re-enabling is a manifest-only add leg, task 3.1).
    await expectRosterLacks(shell, HELLO_WORLD)
    expect(readProfileBundles(shell.profileDir)).toEqual([...BASE_BUNDLES.map(entry => entry.name), FORGE_WORKBENCH])
  } finally {
    await shell.close()
    cleanup()
  }
})
