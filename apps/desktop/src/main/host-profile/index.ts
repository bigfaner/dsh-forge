// host-profile — application-owned host profile + payload projection (disc-2),
// config-ized bundle list + startup reconciliation (ui-plugin-foundation task 2).
//
// The vendored upstream host entry boots with three filesystem inputs:
//   argv[2] runtimeDir — the dsh installation dir whose node_modules carries
//                        the install anchor (vendored apps/desktop-host).
//   argv[3] projectDir — the profile project: package.json `dsh.profile.bundles`
//                        manifest; the host materializes its own node_modules
//                        (link-mode fallback junctions) on first boot.
//   argv[4] source     — primary-runtime payload dir; its sibling
//                        `office-skills/` is a hard host-boot requirement
//                        (upstream office.ts). The interpreter bundle itself
//                        installs lazily on first tool use, so a stub dir is
//                        enough for the boot/handshake bar.
//
// This module projects both app-owned inputs under the shell's userData
// (<userData>/host-profile, <userData>/host-payload) — never inside the
// upstream $DSH_HOME (SC8 coexistence: `runProfile` with `resolvedProfile`
// writes only into the profile dir we hand it).
//
// Task 2 — the bundle list is no longer a shell-code constant. The product
// config (`apps/desktop/resources/plugin-bundles.json`, staged next to the
// other installer resources when packaged) is the plugin tree's single source
// of truth; the projector converges the userData projection to it at startup
// (K8s-style declarative reconciliation, npm `prune` prototype):
//   add leg    — manifest bundle list rewritten to the config order, and each
//                entry carrying a `source` gets its profile-local
//                materialization seeded (a link — provisional distribution
//                form; the packaged form lands with the task-5/6 spike).
//   delete leg — entries the config dropped are pruned from the manifest and
//                their profile-local materialization removed. Upstream-owned
//                module-fallback links under `.dsh-module-fallback/` are never
//                touched (the host heals those itself on every boot); cleanup
//                only invalidates — it never adds an assembly channel, which
//                stays exclusively the profile manifest the host consumes.
//
// The config itself is read-only to this module (AC5): it is loaded once at
// startup and never written — runtime enable/disable writers (M2 UF6) may read
// the same file but must not mutate product-owned entries through it.

import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { shellLog } from '../log.ts'

/** Upstream's profile-owned module-fallback directory (never touched here). */
const PROFILE_MODULE_FALLBACK_DIR = '.dsh-module-fallback'

/** Scoped/plain npm package name; no paths, spaces, or version ranges. */
const BUNDLE_NAME_PATTERN = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-._~]+$/u

/** `workspace:<repo-relative dir>` — the dev materialization source form. */
const SOURCE_PATTERN = /^workspace:(?<rel>.+)$/u

/** One product-config bundle entry. */
export interface PluginBundleEntry {
  /** Bundle package name as listed in the profile manifest `dsh.profile.bundles`. */
  readonly name: string
  /** Materialization source (`workspace:<repo-relative dir>`); entries without one resolve from the vendored installation closure. */
  readonly source?: string
}

/** Parsed product-level plugin-bundles config (single source of truth, task 2). */
export interface PluginBundlesConfig {
  readonly bundles: readonly PluginBundleEntry[]
}

/** A missing / corrupt / invalid product config (explicit startup error path). */
export class PluginBundlesConfigError extends Error {
  readonly code = 'ERR_PLUGIN_BUNDLES_CONFIG'

  constructor(message: string) {
    super(message)
    this.name = 'PluginBundlesConfigError'
  }
}

/** A profile projection that cannot be reconciled (explicit startup error path). */
export class HostProfileError extends Error {
  readonly code = 'ERR_HOST_PROFILE'

  constructor(message: string) {
    super(message)
    this.name = 'HostProfileError'
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Load and validate the product-level plugin-bundles config.
 * @param configPath - absolute path of the product config JSON.
 * @returns the frozen config; every invalid shape fails loud as a
 *   {@link PluginBundlesConfigError} (the shell surfaces it through the
 *   crash-recovery failed state — never a silent startup crash).
 */
export function loadPluginBundlesConfig(configPath: string): PluginBundlesConfig {
  let raw: string
  try {
    raw = readFileSync(configPath, 'utf8')
  } catch {
    throw new PluginBundlesConfigError(`product plugin-bundles config not found at ${configPath} — the bundle list has no other source`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new PluginBundlesConfigError(`product plugin-bundles config ${configPath} is not valid JSON: ${String(error)}`)
  }
  if (!isPlainObject(parsed)) {
    throw new PluginBundlesConfigError(`product plugin-bundles config ${configPath} must hold a JSON object`)
  }
  for (const key of Object.keys(parsed)) {
    if (key !== 'bundles') throw new PluginBundlesConfigError(`unknown key ${JSON.stringify(key)} in ${configPath} (expected only "bundles")`)
  }
  const bundles = parsed.bundles
  if (!Array.isArray(bundles) || bundles.length === 0) {
    throw new PluginBundlesConfigError(`"bundles" in ${configPath} must be a non-empty array`)
  }
  const entries: PluginBundleEntry[] = []
  const seen = new Set<string>()
  for (const candidate of bundles) {
    if (!isPlainObject(candidate)) {
      throw new PluginBundlesConfigError(`every bundle entry in ${configPath} must hold a JSON object`)
    }
    for (const key of Object.keys(candidate)) {
      if (key !== 'name' && key !== 'source') throw new PluginBundlesConfigError(`unknown key ${JSON.stringify(key)} on a bundle entry in ${configPath} (expected "name", "source")`)
    }
    const { name, source } = candidate
    if (typeof name !== 'string' || !BUNDLE_NAME_PATTERN.test(name)) {
      throw new PluginBundlesConfigError(`invalid bundle name ${JSON.stringify(name)} in ${configPath} (expected a plain or scoped npm package name)`)
    }
    if (seen.has(name)) throw new PluginBundlesConfigError(`duplicate bundle name ${JSON.stringify(name)} in ${configPath}`)
    seen.add(name)
    if (source !== undefined && !isValidSource(source)) {
      throw new PluginBundlesConfigError(`invalid source ${JSON.stringify(source)} for bundle ${JSON.stringify(name)} in ${configPath} (expected "workspace:<repo-relative dir>")`)
    }
    entries.push(source === undefined ? { name } : { name, source })
  }
  return Object.freeze({ bundles: Object.freeze(entries) })
}

/** A source spec must be `workspace:<relative dir>` — no absolute paths, drives, or Windows-forbidden characters. */
function isValidSource(source: unknown): source is string {
  if (typeof source !== 'string') return false
  const rel = SOURCE_PATTERN.exec(source)?.groups?.rel
  if (rel === undefined || rel.length === 0) return false
  if (rel.startsWith('/') || rel.startsWith('\\') || /^:[a-zA-Z]:/u.test(rel)) return false
  return !/[<>:"|?*\u0000-\u001f]/u.test(rel)
}

/** Resolve a validated source spec to an absolute directory, failing loud with remediation. */
function resolveSourceDir(entry: PluginBundleEntry, workspaceRoot: string | undefined): string {
  const rel = SOURCE_PATTERN.exec(entry.source as string)?.groups?.rel as string
  if (workspaceRoot === undefined) {
    throw new HostProfileError(`bundle ${entry.name} declares source ${entry.source} but no workspaceRoot anchor was provided (dev wiring error)`)
  }
  const dir = resolve(workspaceRoot, rel)
  if (!existsSync(join(dir, 'package.json'))) {
    throw new HostProfileError(`materialization source for bundle ${entry.name} has no package.json at ${dir} — build the plugin (pnpm build:plugins) or fix the config source`)
  }
  return dir
}

export interface HostProfileDeps {
  /** Profile project dir (app-owned; default <userData>/host-profile). */
  readonly profileDir: string
  /** Vendored office-skills asset tree (packages/skill/skill-office/assets). */
  readonly officeSkillsSource: string
  /** Product-config bundle list (the single source of truth). */
  readonly bundles: readonly PluginBundleEntry[]
  /** Repo root anchoring `workspace:` source specs (dev wiring; packaged sources land with the task-5/6 distribution decision). */
  readonly workspaceRoot?: string
}

export interface HostProfileProjection {
  /** The profile project dir to pass as the host entry's projectDir (argv[3]). */
  readonly profileDir: string
  /** Primary-runtime payload source (argv[4]); undefined when the payload cannot be projected. */
  readonly primaryRuntimeSource: string | undefined
}

function linkTree(target: string, source: string): void {
  symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir')
}

/** Path of a bundle's profile-local materialization under the profile's node_modules. */
function materializationPath(profileDir: string, name: string): string {
  return join(profileDir, 'node_modules', ...name.split('/'))
}

/** Whether an existing path is one of upstream's own module-fallback links (never touched by the shell). */
function isUpstreamFallbackLink(profileDir: string, path: string): boolean {
  try {
    if (!lstatSync(path).isSymbolicLink()) return false
    const target = resolve(dirname(path), readlinkSync(path))
    const rel = relative(join(profileDir, PROFILE_MODULE_FALLBACK_DIR), target)
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
  } catch {
    return false
  }
}

/** Remove the scoped parent directory of a materialization when it becomes empty (best-effort). */
function pruneEmptyScopeParent(profileDir: string, name: string): void {
  if (!name.startsWith('@')) return
  const parent = dirname(materializationPath(profileDir, name))
  try {
    if (readdirOrEmpty(parent).length === 0) rmSync(parent, { recursive: true, force: true })
  } catch { /* best-effort cleanup only */ }
}

function readdirOrEmpty(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

/** Prune the profile-local materialization of a config-removed bundle (delete leg). */
function pruneMaterialization(profileDir: string, name: string): void {
  const path = materializationPath(profileDir, name)
  let stat
  try {
    stat = lstatSync(path)
  } catch {
    return // nothing materialized locally (installation-resolved bundle)
  }
  if (isUpstreamFallbackLink(profileDir, path)) {
    shellLog.info({ code: 'HOST_PROFILE_PRUNE_SKIPPED', message: 'removed bundle materialization is upstream-owned; the host heals it on next boot', data: { bundle: name } })
    return
  }
  if (stat.isDirectory() && !stat.isSymbolicLink()) rmSync(path, { recursive: true, force: true, maxRetries: 5 })
  else unlinkSync(path)
  pruneEmptyScopeParent(profileDir, name)
  shellLog.info({ code: 'HOST_PROFILE_PRUNED', message: 'removed bundle materialization pruned from the host profile', data: { bundle: name } })
}

/** Seed (or re-point) a config bundle's profile-local materialization (add leg). */
function ensureMaterialization(profileDir: string, entry: PluginBundleEntry, workspaceRoot: string | undefined): void {
  const path = materializationPath(profileDir, entry.name)
  if (entry.source === undefined) return // resolves from the vendored installation closure
  const sourceDir = resolveSourceDir(entry, workspaceRoot)
  let stat
  try {
    stat = lstatSync(path)
  } catch {
    stat = undefined
  }
  if (stat !== undefined && isUpstreamFallbackLink(profileDir, path)) {
    shellLog.warn({ code: 'WARN_HOST_PLUGIN_SEED_SKIPPED', message: 'bundle materialization path is an upstream module-fallback link; leaving it to the host', data: { bundle: entry.name } })
    return
  }
  if (stat !== undefined && !stat.isSymbolicLink()) {
    shellLog.warn({ code: 'WARN_HOST_PLUGIN_SEED_SKIPPED', message: 'bundle materialization path already holds a non-link package (package-manager owned); leaving it untouched', data: { bundle: entry.name } })
    return
  }
  if (stat !== undefined) unlinkSync(path) // stale shell-seeded link — re-point to the config source
  mkdirSync(dirname(path), { recursive: true })
  linkTree(path, sourceDir)
  shellLog.info({ code: 'HOST_PLUGIN_SEEDED', message: 'bundle materialization seeded from the product config source', data: { bundle: entry.name, source: sourceDir } })
}

interface HostProfileManifest {
  name?: unknown
  private?: unknown
  dependencies?: Record<string, string>
  dsh?: { profile?: { bundles?: unknown } }
}

/** Read the projected profile manifest, failing loud when it is corrupt. */
function readProfileManifest(profileDir: string): HostProfileManifest {
  const manifestPath = join(profileDir, 'package.json')
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    throw new HostProfileError(`host profile manifest ${manifestPath} is not valid JSON: ${String(error)} — remove the directory and relaunch to re-project it`)
  }
  if (!isPlainObject(parsed)) throw new HostProfileError(`host profile manifest ${manifestPath} must hold a JSON object`)
  return parsed
}

/** Order-sensitive bundle list comparison (upstream `sameBundles` semantics). */
function sameBundles(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

/**
 * Project the host profile project and the office payload source, reconciling
 * the manifest bundle list and profile-local materializations against the
 * product config (single source of truth). Existing host-managed materialization
 * is never reset: only the shell-owned manifest list and the shell-seeded links
 * converge to the config; upstream-owned fallback links are left to the host.
 */
export function projectHostProfile(deps: HostProfileDeps): HostProfileProjection {
  const { profileDir, officeSkillsSource, bundles } = deps
  const desired = bundles.map(entry => entry.name)

  mkdirSync(profileDir, { recursive: true })
  const manifestPath = join(profileDir, 'package.json')
  let currentBundles: string[] = []
  if (!existsSync(manifestPath)) {
    writeFileSync(manifestPath, `${JSON.stringify({
      name: 'dsh-forge-host-profile',
      private: true,
      dsh: { profile: { bundles: [...desired] } },
    }, undefined, 2)}\n`)
    shellLog.info({ code: 'HOST_PROFILE_INITIALIZED', message: 'host profile manifest written', data: { dir: profileDir, bundles: [...desired] } })
  } else {
    const manifest = readProfileManifest(profileDir)
    const declared = manifest.dsh?.profile?.bundles
    if (declared === undefined) currentBundles = []
    else if (Array.isArray(declared) && declared.every(name => typeof name === 'string')) currentBundles = [...declared]
    else throw new HostProfileError(`host profile manifest ${manifestPath} has a non-string-array dsh.profile.bundles`)
    if (!sameBundles(currentBundles, desired)) {
      // Delete leg first (prune while the old list is still known), then rewrite.
      for (const name of currentBundles) {
        if (!desired.includes(name)) pruneMaterialization(profileDir, name)
      }
      const updated = { ...manifest, dsh: { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles: [...desired] } } }
      writeFileSync(manifestPath, `${JSON.stringify(updated, undefined, 2)}\n`)
      shellLog.info({ code: 'HOST_PROFILE_RECONCILED', message: 'host profile bundle list converged to the product config', data: { from: currentBundles, to: [...desired] } })
    }
  }
  // Add leg: seed profile-local materializations for config entries with a source.
  for (const entry of bundles) ensureMaterialization(profileDir, entry, deps.workspaceRoot)

  // Payload: <sibling-of-profileDir>/host-payload/{primary-runtime/, office-skills@link}.
  // The host's office plugin resolves assetRoot = dirname(source)/office-skills.
  const payloadDir = join(dirname(profileDir), 'host-payload')
  const officeSkillsLink = join(payloadDir, 'office-skills')
  const primaryRuntimeSource = join(payloadDir, 'primary-runtime')
  mkdirSync(primaryRuntimeSource, { recursive: true })
  if (!existsSync(officeSkillsSource)) {
    shellLog.warn({ code: 'WARN_HOST_OFFICE_ASSETS_MISSING', message: 'vendored office-skills assets not installed — host boot will fail at the office plugin', data: { expected: officeSkillsSource, remediation: 'node scripts/install-host-closure.mjs' } })
    return { profileDir, primaryRuntimeSource: undefined }
  }
  if (!existsSync(officeSkillsLink)) {
    linkTree(officeSkillsLink, officeSkillsSource)
    shellLog.info({ code: 'HOST_PAYLOAD_LINKED', message: 'office-skills payload linked', data: { target: officeSkillsSource } })
  }
  return { profileDir, primaryRuntimeSource }
}
