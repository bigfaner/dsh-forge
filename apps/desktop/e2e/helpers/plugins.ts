// Shared plugin-journey fixture stack (gen-test-scripts, ui-plugin-foundation
// T-test-gen-scripts): the REAL apps/desktop/dist/main.cjs main process over
// an isolated temp profile + temp product config (DSH_FORGE_PLUGIN_BUNDLES),
// in two flavors:
//   launchPluginShell — the REAL chain (vendored host child + real web dist):
//                       boot-roster / pageerror / offline-proxy observables;
//   launchStateShell  — the fast fixture-host variant (helpers/fixture-app.ts)
//                       for pure startup-reconciliation state legs.
// Every shell input (config, profile, staged tarballs) lives under a per-test
// temp dir; the repo tree, real userData, and $DSH_HOME are never touched
// (TEST-isolation-000). Plugin panels themselves render only on completed
// assistant turns (task 2 evidence) — session content is user data, so the
// assembly-level web observable here is the boot roster (__DSH_BOOT__ entries)
// plus the pageerror channel; DOM panel/screenshot evidence rides the
// live-ui-probe --plugin-leg channel (archived artifacts).
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ElectronApplication, Page } from '@playwright/test'
import { _electron, expect } from '@playwright/test'
import { launchFixtureApp, type FixtureApp } from './fixture-app.ts'

export const REPO_ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))
export const MAIN_PATH = join(REPO_ROOT, 'apps', 'desktop', 'dist', 'main.cjs')
export const HELLO_WORLD_DIR = join(REPO_ROOT, 'packages', 'plugins', 'hello-world')
export const COLLISION_DIR = join(REPO_ROOT, 'packages', 'plugins', 'hello-world-collision')
export const TEMPLATE_DIR = join(REPO_ROOT, 'packages', 'templates', 'plugin')
export const PRODUCT_CONFIG = join(REPO_ROOT, 'apps', 'desktop', 'resources', 'plugin-bundles.json')
/**
 * The hello-world tarball for journeys: packed on demand via pnpm pack. The
 * demo plugin is not a default product bundle (default config = the two
 * vendored-closure base entries), so journeys produce their own artifact —
 * the exact bytes the stage channel would stage for a tarball-sourced entry.
 */
export function helloWorldTarball(): string {
  return packPlugin(HELLO_WORLD_DIR).tarball
}
export const HELLO_WORLD = '@dsh-forge/plugin-hello-world'
export const COLLISION_FIXTURE = '@dsh-forge/plugin-hello-world-collision'
/** The vendored lock baseline (FT-015) — the alignment line every gate reads. */
export const LOCK_BASELINE = {
  pinnedSha: 'c36ba648dc106d21fb32562793b3e3b9c8922bc4',
  desktopHostVersion: '0.1.6-alpha.2',
  cordisVersion: '4.0.2',
} as const

/** The two vendored-closure base entries every bootable config carries. */
export const BASE_BUNDLES = [
  { name: '@deepseek-ai/dsh-base' },
  { name: '@deepseek-ai/dsh-web-app' },
] as const

/** One product-config bundle entry (apps/desktop/resources/plugin-bundles.json shape). */
export interface BundleEntry {
  readonly name: string
  readonly source?: string
}

/** Serialize a plugin-bundles config exactly like the product resource. */
export function bundlesConfigJson(entries: readonly BundleEntry[]): string {
  return `${JSON.stringify({
    bundles: entries.map(entry => ({ name: entry.name, ...(entry.source === undefined ? {} : { source: entry.source }) })),
  }, undefined, 2)}\n`
}

/** sha256 of a file's bytes (the seed-marker digest vocabulary). */
export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** Deterministic content hash of a directory tree (diff=0 legs): sorted
 * relative paths + file bytes — the checksum face of task 2's md5 evidence. */
export function hashTree(dir: string): string {
  const files: string[] = []
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else files.push(relative(dir, full).split(sep).join('/'))
    }
  }
  walk(dir)
  const hash = createHash('md5')
  for (const file of files.sort()) hash.update(file).update(readFileSync(join(dir, file)))
  return hash.digest('hex')
}

/** Profile manifest bundle list (order-sensitive) after reconciliation. */
export function readProfileBundles(profileDir: string): string[] {
  const manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')) as
    { dsh?: { profile?: { bundles?: unknown } } }
  const declared = manifest.dsh?.profile?.bundles
  if (!Array.isArray(declared)) return []
  return declared.map(name => String(name))
}

/** Path of a bundle's profile-local materialization under node_modules. */
export function materializationDir(profileDir: string, name: string): string {
  return join(profileDir, 'node_modules', ...name.split('/'))
}

/** The shell-owned pre-seed marker of a materialization, when present. */
export function readSeedMarker(profileDir: string, name: string):
  | { bundle: string; source: string; sha256: string; seededAt: string }
  | undefined {
  const markerPath = join(materializationDir(profileDir, name), '.dsh-forge-seed.json')
  if (!existsSync(markerPath)) return undefined
  return JSON.parse(readFileSync(markerPath, 'utf8')) as { bundle: string; source: string; sha256: string; seededAt: string }
}

const packCache = new Map<string, { tarball: string; sha256: string }>()

/**
 * pnpm-pack a real workspace plugin package (the stage-plugin-tarballs.mjs
 * channel, offline: pack is local-only — no registry, no install). A version
 * override copies the package to a scratch dir first, so two packs of the
 * same identity with different content (sha drift fixtures) are derivable.
 */
export function packPlugin(pluginDir: string, versionOverride?: string): { tarball: string; sha256: string } {
  const key = `${pluginDir}@${versionOverride ?? ''}`
  const cached = packCache.get(key)
  if (cached !== undefined) return cached
  let packDir = pluginDir
  if (versionOverride !== undefined) {
    packDir = mkdtempSync(join(tmpdir(), 'dsh-forge-pack-src-'))
    cpSync(pluginDir, packDir, {
      recursive: true,
      filter: src => !src.split(sep).includes('node_modules') && !src.endsWith('.tsbuildinfo'),
    })
    const manifestPath = join(packDir, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version: string }
    writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, version: versionOverride }, undefined, 2)}\n`)
  }
  if (!existsSync(join(packDir, 'lib', 'index.js'))) {
    throw new Error(`${packDir} has no built lib/index.js — run pnpm build:plugins first`)
  }
  const scratch = mkdtempSync(join(tmpdir(), 'dsh-forge-pack-out-'))
  const result = spawnSync('pnpm', ['pack', '--pack-destination', scratch], { cwd: packDir, shell: true, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`pnpm pack failed in ${packDir}: ${(result.stderr ?? result.stdout ?? '').trim().slice(0, 300)}`)
  }
  const produced = readdirSync(scratch).filter(name => name.endsWith('.tgz'))
  if (produced.length !== 1) {
    throw new Error(`pnpm pack in ${packDir} produced ${String(produced.length)} tarballs (expected exactly 1)`)
  }
  const tarball = join(scratch, produced[0] as string)
  const entry = { tarball, sha256: sha256File(tarball) }
  packCache.set(key, entry)
  return entry
}

/** A tarball:-source config entry + the artifact to stage next to the config. */
export function tarballEntry(name: string, tarball: string, at: string): { entry: BundleEntry; stagedAt: string; from: string } {
  return { entry: { name, source: `tarball:${at}` }, stagedAt: at, from: tarball }
}

export interface PluginShellOptions {
  /** Config entries; defaults to the two vendored-closure base bundles. */
  readonly bundles?: readonly BundleEntry[]
  /** Artifacts copied under the temp resources root before launch. */
  readonly stageTarballs?: ReadonlyArray<{ at: string; from: string }>
  readonly env?: Record<string, string>
  /** Boot through a dead proxy: all external HTTP fails, dsh-app:// must not. */
  readonly offlineProxy?: boolean
  /** Skip the ui-ready wait (failure-path launches resolve the gate failed). */
  readonly expectFailure?: boolean
  /** Persistent root for multi-boot tests (default: a fresh temp dir per launch). */
  readonly rootDir?: string
}

export interface PluginShell {
  readonly electronApp: ElectronApplication
  readonly page: Page
  /** Temp root holding config + resources (resourcesRoot = dirname(config)). */
  readonly dir: string
  readonly configPath: string
  readonly profileDir: string
  /** Every renderer pageerror since launch (the collision/observability channel). */
  readonly pageErrors: string[]
  writeConfig(entries: readonly BundleEntry[]): void
  stageTarball(at: string, from: string): void
  configBytes(): string
  /** Wait for the real web UI to hydrate (the probe's ui-ready anchor). */
  uiReady(): Promise<void>
  /** @dsh-forge/* ids in the host-pushed boot roster (assembly evidence). */
  rosterProductPlugins(): Promise<string[]>
  /** Recovery machine state over the real dshForge IPC bridge. */
  recoveryState(): Promise<string>
  close(): Promise<void>
}

/**
 * Launch the REAL chain against an isolated temp profile: vendored host child
 * + real web dist (no HOST_ENTRY/WEB_ROOT overrides) + temp product config.
 * The startup reconciliation that runs is the production code path.
 */
export async function launchPluginShell(options: PluginShellOptions = {}): Promise<PluginShell> {
  const dir = options.rootDir ?? mkdtempSync(join(tmpdir(), 'dsh-forge-plugin-e2e-'))
  mkdirSync(dir, { recursive: true })
  const configPath = join(dir, 'plugin-bundles.json')
  writeFileSync(configPath, bundlesConfigJson(options.bundles ?? BASE_BUNDLES))
  const profileDir = join(dir, 'host-profile')
  for (const staged of options.stageTarballs ?? []) {
    const dest = join(dir, staged.at)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(staged.from, dest)
  }
  const args = [MAIN_PATH]
  if (options.offlineProxy === true) args.push('--proxy-server=http://127.0.0.1:9')
  const electronApp = await _electron.launch({
    args,
    env: {
      ...process.env,
      DSH_FORGE_PLUGIN_BUNDLES: configPath,
      DSH_FORGE_PROFILE_DIR: profileDir,
      ...options.env,
    },
  })
  const page = await electronApp.firstWindow()
  const pageErrors: string[] = []
  page.on('pageerror', (error) => { pageErrors.push(String(error)) })
  const shell: PluginShell = {
    electronApp,
    page,
    dir,
    configPath,
    profileDir,
    pageErrors,
    writeConfig: (entries) => { writeFileSync(configPath, bundlesConfigJson(entries)) },
    stageTarball: (at, from) => {
      const dest = join(dir, at)
      mkdirSync(dirname(dest), { recursive: true })
      copyFileSync(from, dest)
    },
    configBytes: () => readFileSync(configPath, 'utf8'),
    uiReady: async () => {
      await page.waitForURL(url => url.href.startsWith('dsh-app://app/'), { timeout: 30_000 })
      await page.getByRole('button', { name: /新建会话|New Session/ }).first().waitFor({ state: 'visible', timeout: 90_000 })
    },
    rosterProductPlugins: () => page.evaluate(() => {
      const boot = (globalThis as { __DSH_BOOT__?: { entries?: unknown[] } }).__DSH_BOOT__
      if (boot === undefined) return []
      const ids = [...(boot.entries ?? [])].map((row) => {
        const entry = row as { id?: unknown; name?: unknown }
        return String(entry.id ?? entry.name ?? '')
      }).filter(id => id !== '')
      return ids.filter(id => id.startsWith('@dsh-forge/'))
    }),
    recoveryState: () => recoveryStateOf(page),
    close: async () => { await electronApp.close().catch(() => {}) },
  }
  if (options.expectFailure === true) {
    // Failure path: the SPA boot gate resolves failed — the page may or may
    // not reach dsh-app:// before the UF4 overlay takes it; both are fine.
    await page.waitForURL(url => url.href.startsWith('dsh-app://app/'), { timeout: 30_000 }).catch(() => {})
  } else {
    await shell.uiReady()
  }
  return shell
}

export interface StateShell {
  readonly fixture: FixtureApp
  /** Temp root holding config + staged resources (persistent across reboots). */
  readonly dir: string
  readonly configPath: string
  readonly profileDir: string
  writeConfig(entries: readonly BundleEntry[]): void
  stageTarball(at: string, from: string): void
  close(): Promise<void>
}

/**
 * Launch the real main process with the FAST fixture host (no vendored host
 * child): the startup reconciliation (config load + profile projection) is
 * the real production path and completes before host start, so once the
 * fixture SPA is up the on-disk profile state is assertable.
 */
export async function launchStateShell(options: PluginShellOptions = {}): Promise<StateShell> {
  const dir = options.rootDir ?? mkdtempSync(join(tmpdir(), 'dsh-forge-state-e2e-'))
  mkdirSync(dir, { recursive: true })
  const configPath = join(dir, 'plugin-bundles.json')
  writeFileSync(configPath, bundlesConfigJson(options.bundles ?? BASE_BUNDLES))
  const profileDir = join(dir, 'host-profile')
  for (const staged of options.stageTarballs ?? []) {
    const dest = join(dir, staged.at)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(staged.from, dest)
  }
  const fixture = await launchFixtureApp({
    env: {
      DSH_FORGE_PLUGIN_BUNDLES: configPath,
      DSH_FORGE_PROFILE_DIR: profileDir,
      ...options.env,
    },
  })
  return {
    fixture,
    dir,
    configPath,
    profileDir,
    writeConfig: (entries) => { writeFileSync(configPath, bundlesConfigJson(entries)) },
    stageTarball: (at, from) => {
      const dest = join(dir, at)
      mkdirSync(dirname(dest), { recursive: true })
      copyFileSync(from, dest)
    },
    close: fixture.close,
  }
}

/** Poll-assert the boot roster contains the product plugin (assembly landed). */
export async function expectRosterContains(shell: PluginShell, name: string): Promise<void> {
  await expect.poll(() => shell.rosterProductPlugins(), { timeout: 30_000 }).toContainEqual(name)
}

/** Poll-assert the boot roster does NOT contain the plugin (assembly absent). */
export async function expectRosterLacks(shell: PluginShell, name: string): Promise<void> {
  await expect.poll(() => shell.rosterProductPlugins(), { timeout: 30_000 }).not.toContain(name)
}

/** Recovery machine state over the real dshForge IPC bridge (any dsh-app page). */
export function recoveryStateOf(page: Page): Promise<string> {
  return page.evaluate(() => {
    const bridge = (globalThis as { dshForge?: { recovery?: { getState?: () => Promise<string> } } }).dshForge
    return bridge?.recovery?.getState?.() ?? Promise.resolve('bridge-missing')
  })
}

/** Poll-assert the crash-recovery machine reached its terminal failed state. */
export async function expectRecoveryFailed(page: Page): Promise<void> {
  await expect.poll(() => recoveryStateOf(page), { timeout: 30_000 }).toBe('failed')
  await expect(page.locator('#dsh-forge-crash-recovery')).toBeVisible()
}

/** Assert a bundle is materialized in the profile with a well-formed seed marker. */
export async function expectMaterialized(profileDir: string, name: string, source: string, sha256: string): Promise<void> {
  const marker = readSeedMarker(profileDir, name)
  expect(marker, `seed marker of ${name}`).toMatchObject({ bundle: name, source, sha256 })
  const manifest = JSON.parse(readFileSync(join(materializationDir(profileDir, name), 'package.json'), 'utf8')) as { name?: string }
  expect(manifest.name, 'materialized package identity').toBe(name)
}

/** Assert a bundle has NO profile-local materialization left (delete leg). */
export function expectNotMaterialized(profileDir: string, name: string): void {
  expect(existsSync(materializationDir(profileDir, name)), `materialization of ${name}`).toBe(false)
  expect(readSeedMarker(profileDir, name), `seed marker of ${name}`).toBeUndefined()
}
